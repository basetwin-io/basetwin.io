#!/usr/bin/env node
// Check every external link of the built site (dist/) and of content/references.json.
//
//   ok       2xx
//   blocked  202, 401, 403, 429: the server refuses automated clients; reported, not a failure
//   broken   everything else (404, 410, 5xx, DNS or TLS error, timeout); exit code 1
//
// A link that redirects to a "not found" page with status 200 is not detected.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const BLOCKED = new Set([202, 401, 403, 429]);
const TIMEOUT_MS = 25_000;
const CONCURRENCY = 6;

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

async function collect() {
  const urls = new Set();
  const refs = JSON.parse(await readFile(join(root, 'content/references.json'), 'utf8'));
  for (const item of refs.items) urls.add(item.url);
  if (!existsSync(dist)) {
    console.error('check-links: dist/ not found, run "npm run build" first');
    process.exit(2);
  }
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(file, 'utf8');
    for (const [, url] of html.matchAll(/\shref="(https?:\/\/[^"]+)"/g)) urls.add(url.replaceAll('&amp;', '&'));
  }
  return [...urls].sort();
}

async function check(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'basetwin.io-link-check (+https://github.com/basetwin-io/basetwin.io)', accept: 'text/html,*/*' },
    });
    await response.body?.cancel();
    if (response.ok && response.status !== 202) return { url, state: 'ok', detail: response.status };
    if (BLOCKED.has(response.status)) return { url, state: 'blocked', detail: response.status };
    if (response.status >= 500 && attempt < 3) return check(url, attempt + 1);
    return { url, state: 'broken', detail: response.status };
  } catch (error) {
    if (attempt < 3) return check(url, attempt + 1);
    return { url, state: 'broken', detail: error.cause?.code ?? error.name };
  }
}

const urls = await collect();
// Links to this project's own repositories may be private until they open.
const config = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const skipped = config.flags.coreOpen ? [] : [config.links.core];
const queue = urls.filter((u) => !skipped.includes(u) && !u.startsWith(config.siteUrl));
const results = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) results.push(await check(queue.shift()));
  }),
);

const by = (state) => results.filter((r) => r.state === state).sort((a, b) => a.url.localeCompare(b.url));
for (const r of by('blocked')) console.log(`blocked ${r.detail}  ${r.url}`);
for (const r of by('broken')) console.log(`BROKEN  ${r.detail}  ${r.url}`);
console.log(`check-links: ${by('ok').length} ok, ${by('blocked').length} blocked (not verified), ${by('broken').length} broken`);
process.exit(by('broken').length ? 1 : 0);
