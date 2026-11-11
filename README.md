# basetwin.io

Source of the [BaseTwin](https://github.com/basetwin-io) landing page, published at <https://basetwin.io>.

The site is static: hand-written HTML, CSS and a little JavaScript, no framework, no database, no tracking. A
dependency-free Node script assembles the pages and renders the reference list.

## Layout

```
site.config.json            site URL, locales, release shown on the page, links, flags
content/references.json     the reference list (digital twin, data space)
src/pages/<locale>/         index.html (page template) and strings.json (UI strings of generated parts)
src/assets/                 css, js, images; copied as is
scripts/build.mjs           build into dist/
scripts/check-links.mjs     check every external link
scripts/serve.mjs           local preview of dist/
.github/workflows/          deploy to GitHub Pages; weekly link check
```

## Build and preview

Requires Node.js 20 or later. There is nothing to install.

```bash
npm run build         # writes dist/, validates references and internal links
npm run serve         # http://localhost:4173
npm run check:links   # external links; needs network access
```

## Add or change a reference

Edit `content/references.json` and add an object to `items`:

```json
{
  "id": "dcat-3",
  "group": "data-space",
  "title": "Data Catalog Vocabulary (DCAT) Version 3",
  "url": "https://www.w3.org/TR/vocab-dcat-3/",
  "publisher": "W3C",
  "type": "standard",
  "year": 2024,
  "tags": ["catalog"],
  "note": { "en": "One sentence: what it is and why it matters." },
  "added": "2026-11-11"
}
```

* `group` is one of the ids in `groups`; `type` is one of the keys of `types`.
* `year` is optional (leave it out for living documents and projects).
* `note` is keyed by locale; a missing locale falls back to the default locale.
* Entries are shown in file order inside their group.

The build fails on a missing field, a duplicate id, an unknown group or type, or a URL that is not `https://`.
Pushing to `main` publishes the change.

## Update the release shown on the page

Set `release.version` and `release.date` in `site.config.json`.

## Flags

| Flag | Meaning |
|---|---|
| `coreOpen` | `false` while the core repository is private: the page links to the GitHub organisation and says the repository is opening soon. Set it to `true` when `basetwin-io/BaseTwin` is public. |

## Add a language

1. Copy `src/pages/en/` to `src/pages/<locale>/` (for example `ja`) and translate `index.html` and `strings.json`.
2. Add the locale to `locales` in `site.config.json`.
3. Add the locale to the texts in `content/references.json` where a translation is wanted.

The default locale is served at `/`, every other locale at `/<locale>/`. With more than one locale the build adds
`hreflang` links and a language switch to the header.

## Deployment

`.github/workflows/deploy.yml` builds the site and deploys `dist/` to GitHub Pages on every push to `main`.
The custom domain is set in the repository settings (Pages); DNS for `basetwin.io` points to GitHub Pages.

## Licence

Apache-2.0, see [LICENSE](LICENSE). Names of standards and projects in the reference list belong to their owners.
