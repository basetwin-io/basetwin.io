#!/usr/bin/env node
// Static build of basetwin.io. No dependencies.
//
//   src/pages/<locale>/index.html   page template of one locale
//   src/pages/<locale>/strings.json UI strings used by generated parts
//   src/assets/                     copied as is
//   content/references.json         reference list, rendered into {{references}}
//   site.config.json                site URL, locales, release, links, flags
//
// The default locale is written to dist/, every other locale to dist/<locale>/.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const fail = (message) => {
  console.error(`build: ${message}`);
  process.exit(1);
};

// ---------------------------------------------------------------- references

const REQUIRED = ['id', 'group', 'title', 'url', 'publisher', 'type', 'tags', 'note', 'added'];

export function validateReferences(refs) {
  const errors = [];
  const groups = new Set(refs.groups.map((g) => g.id));
  const seen = new Set();
  for (const [index, item] of refs.items.entries()) {
    const where = `items[${index}] (${item.id ?? 'no id'})`;
    for (const key of REQUIRED) if (item[key] === undefined) errors.push(`${where}: missing "${key}"`);
    if (seen.has(item.id)) errors.push(`${where}: duplicate id`);
    seen.add(item.id);
    if (!groups.has(item.group)) errors.push(`${where}: unknown group "${item.group}"`);
    if (!refs.types[item.type]) errors.push(`${where}: unknown type "${item.type}"`);
    if (!/^https:\/\//.test(item.url ?? '')) errors.push(`${where}: url must start with https://`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.added ?? '')) errors.push(`${where}: added must be YYYY-MM-DD`);
    if (!Array.isArray(item.tags)) errors.push(`${where}: tags must be a list`);
    if (item.year !== undefined && !Number.isInteger(item.year)) errors.push(`${where}: year must be a number`);
  }
  return errors;
}

// A text is either a string or an object keyed by locale; fall back to the default locale.
const localised = (text, locale, fallback) =>
  typeof text === 'string' ? text : (text?.[locale] ?? text?.[fallback] ?? '');

function renderReferences(refs, locale, config, strings) {
  const t = (text) => escapeHtml(localised(text, locale, config.defaultLocale));
  const usedTypes = Object.keys(refs.types).filter((type) => refs.items.some((i) => i.type === type));

  const filters = [
    `<button type="button" class="chip is-active" data-filter="all" aria-pressed="true">${escapeHtml(strings.filterAll)}</button>`,
    ...usedTypes.map(
      (type) =>
        `<button type="button" class="chip" data-filter="${type}" aria-pressed="false">${t(refs.types[type])}</button>`,
    ),
  ].join('\n        ');

  const groups = refs.groups
    .map((group) => {
      const items = refs.items
        .filter((item) => item.group === group.id)
        .map((item) => {
          const meta = [item.publisher, item.year].filter(Boolean).map(escapeHtml).join(' · ');
          return `          <li class="ref" data-type="${item.type}" id="ref-${escapeHtml(item.id)}">
            <span class="ref-type">${t(refs.types[item.type])}</span>
            <a class="ref-title" href="${escapeHtml(item.url)}" rel="noopener">${escapeHtml(item.title)}</a>
            <p class="ref-note">${t(item.note)}</p>
            <p class="ref-meta">${meta}</p>
          </li>`;
        })
        .join('\n');
      return `      <section class="ref-group" aria-labelledby="refs-${group.id}">
        <h3 id="refs-${group.id}">${t(group.title)}</h3>
        <p class="ref-intro">${t(group.intro)}</p>
        <ul class="ref-list">
${items}
        </ul>
      </section>`;
    })
    .join('\n');

  const updated = refs.items.map((i) => i.added).sort().at(-1);
  return `<div class="ref-filters" role="group" aria-label="${escapeHtml(strings.filterLabel)}">
        ${filters}
      </div>
      <div class="ref-groups">
${groups}
      </div>
      <p class="ref-updated">${escapeHtml(strings.updated)} <time datetime="${updated}">${updated}</time> · ${refs.items.length} ${escapeHtml(strings.entries)}</p>`;
}

// ------------------------------------------------------------------ template

// <!-- if:flag --> ... <!-- else --> ... <!-- endif -->  (else is optional, no nesting)
function applyConditionals(html, flags) {
  return html.replace(
    /<!-- if:(\w+) -->([\s\S]*?)(?:<!-- else -->([\s\S]*?))?<!-- endif -->/g,
    (_, flag, yes, no = '') => {
      if (!(flag in flags)) fail(`unknown flag "${flag}" in template`);
      return flags[flag] ? yes : no;
    },
  );
}

function applyTokens(html, values) {
  return html.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    if (!(key in values)) fail(`unknown token {{${key}}} in template`);
    return values[key];
  });
}

const localePath = (locale, config) => (locale === config.defaultLocale ? '' : `${locale}/`);

function headLinks(locale, config) {
  const url = (l) => `${config.siteUrl}/${localePath(l, config)}`;
  const lines = [`<link rel="canonical" href="${url(locale)}">`];
  if (config.locales.length > 1) {
    for (const l of config.locales) lines.push(`<link rel="alternate" hreflang="${l}" href="${url(l)}">`);
    lines.push(`<link rel="alternate" hreflang="x-default" href="${url(config.defaultLocale)}">`);
  }
  return lines.join('\n  ');
}

function languageSwitch(locale, config, base) {
  if (config.locales.length < 2) return '';
  const links = config.locales
    .map((l) => {
      const current = l === locale ? ' aria-current="true"' : '';
      return `<a href="${base}${localePath(l, config)}" lang="${l}" hreflang="${l}"${current}>${l.toUpperCase()}</a>`;
    })
    .join('');
  return `<div class="lang-switch">${links}</div>`;
}

// Every #anchor and local file referenced by the page must exist.
function checkInternalLinks(html, outDir, label) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const errors = [];
  for (const [, , target] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(target)) continue;
    const [path, hash] = target.split('#');
    if (path === '' && hash !== undefined) {
      if (hash !== '' && !ids.has(hash)) errors.push(`${label}: missing anchor #${hash}`);
      continue;
    }
    const file = join(outDir, path.endsWith('/') || path === '' ? `${path}index.html` : path);
    if (!existsSync(file)) errors.push(`${label}: missing file ${target}`);
  }
  return errors;
}

// ---------------------------------------------------------------------- main

async function main() {
  const config = await readJson('site.config.json');
  const refs = await readJson('content/references.json');

  const refErrors = validateReferences(refs);
  if (refErrors.length) fail(`content/references.json\n  ${refErrors.join('\n  ')}`);

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await cp(join(root, 'src/assets'), join(dist, 'assets'), { recursive: true });

  const pages = [];
  for (const locale of config.locales) {
    const dir = `src/pages/${locale}`;
    if (!existsSync(join(root, dir, 'index.html'))) fail(`locale "${locale}" has no ${dir}/index.html`);
    const strings = await readJson(`${dir}/strings.json`);
    const template = await readFile(join(root, dir, 'index.html'), 'utf8');
    const base = locale === config.defaultLocale ? '' : '../';
    const outDir = join(dist, localePath(locale, config));

    const values = {
      base,
      locale,
      siteUrl: config.siteUrl,
      pageUrl: `${config.siteUrl}/${localePath(locale, config)}`,
      headLinks: headLinks(locale, config),
      languageSwitch: languageSwitch(locale, config, base),
      references: renderReferences(refs, locale, config, strings),
      'release.version': escapeHtml(config.release.version),
      'release.date': escapeHtml(config.release.date),
      year: String(new Date().getUTCFullYear()),
      ...Object.fromEntries(Object.entries(config.links).map(([k, v]) => [`links.${k}`, escapeHtml(v)])),
    };

    const html = applyTokens(applyConditionals(template, config.flags), values);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), html);
    pages.push({ locale, html, outDir, url: values.pageUrl });
  }

  // GitHub Pages serves 404.html for unknown paths; absolute asset paths keep it working at any depth.
  const notFound = pages[0].html
    .replaceAll('href="assets/', 'href="/assets/')
    .replaceAll('src="assets/', 'src="/assets/')
    .replace(/<main[\s\S]*<\/main>/, `<main id="main" class="not-found"><div class="wrap"><h1>Page not found</h1><p>The page you are looking for does not exist.</p><p><a class="button" href="/">Back to the home page</a></p></div></main>`)
    .replace(/<link rel="canonical"[^>]*>/, '<meta name="robots" content="noindex">')
    .replaceAll('href="#', 'href="/#');
  await writeFile(join(dist, '404.html'), notFound);

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((p) => `  <url><loc>${p.url}</loc><lastmod>${today}</lastmod></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  await writeFile(join(dist, '.nojekyll'), '');

  const linkErrors = pages.flatMap((p) => checkInternalLinks(p.html, p.outDir, `${p.locale}/index.html`));
  if (linkErrors.length) fail(`broken internal links\n  ${linkErrors.join('\n  ')}`);

  console.log(`build: ${pages.length} page(s), ${refs.items.length} references -> dist/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
