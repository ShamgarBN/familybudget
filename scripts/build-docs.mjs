#!/usr/bin/env node
/**
 * Builds standalone HTML versions of README.md and MANUAL.md with inlined CSS.
 *
 *   node scripts/build-docs.mjs
 *
 * The generated HTML files (README.html, MANUAL.html) live alongside the
 * markdown sources, are fully self-contained, and look good both on screen
 * and when printed (⌘P → Save as PDF).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap');

:root {
  --bg: #f0f3f8;
  --surface: #ffffff;
  --ink: #0b1220;
  --muted: #64748b;
  --line: #e2e8f0;
  --accent: #3b7eff;
  --accent-soft: rgba(59, 126, 255, 0.08);
  --code-bg: #0f172a;
  --code-fg: #e2e8f0;
}

* { box-sizing: border-box; }
html, body { padding: 0; margin: 0; }
body {
  font-family: 'DM Sans', system-ui, -apple-system, Segoe UI, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 56px 48px 80px;
  background: var(--surface);
  min-height: 100vh;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(240, 243, 248, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
  padding: 10px 0;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.toolbar .brand {
  font-size: 13px;
  color: var(--muted);
}
.toolbar .actions { display: flex; gap: 8px; }
.toolbar button, .toolbar a {
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}
.toolbar button:hover, .toolbar a:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.toolbar button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
.toolbar button.primary:hover { color: white; opacity: 0.92; }

h1, h2, h3, h4 {
  font-weight: 700;
  letter-spacing: -0.01em;
  page-break-after: avoid;
}
h1 {
  font-size: 32px;
  margin: 0 0 12px;
  padding-bottom: 12px;
  border-bottom: 3px solid var(--accent);
}
h2 {
  font-size: 22px;
  margin: 40px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
h3 { font-size: 17px; margin: 28px 0 8px; color: #1e293b; }
h4 { font-size: 15px; margin: 18px 0 6px; color: #334155; }

p { margin: 8px 0 14px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

ul, ol { margin: 8px 0 16px; padding-left: 26px; }
li { margin: 4px 0; }
li > p { margin: 4px 0; }
li ::marker { color: var(--muted); }

hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 32px 0;
}

blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  color: #475569;
  border-radius: 0 6px 6px 0;
}

code, kbd, pre {
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

:not(pre) > code {
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #0f172a;
  border: 1px solid var(--line);
}

pre {
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 16px 18px;
  border-radius: 10px;
  overflow-x: auto;
  font-size: 13.5px;
  line-height: 1.55;
  margin: 12px 0 20px;
  page-break-inside: avoid;
}
pre code {
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 0.85em;
  background: linear-gradient(to bottom, #ffffff, #f1f5f9);
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.12);
  color: #0f172a;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0 20px;
  font-size: 14px;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid var(--line);
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f8fafc;
  font-weight: 600;
}
tbody tr:nth-child(even) td { background: #fbfcfd; }

img { max-width: 100%; height: auto; }

/* Print styling */
@media print {
  body { background: #fff; font-size: 11pt; }
  .page {
    max-width: none;
    margin: 0;
    padding: 0;
    border: none;
    min-height: 0;
  }
  .toolbar { display: none; }
  h1 { font-size: 22pt; }
  h2 { font-size: 15pt; }
  h3 { font-size: 12pt; }
  pre { font-size: 9.5pt; }
  a { color: inherit; text-decoration: none; }
  table, pre { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
}
`

const template = ({ title, body, otherLink, otherLabel }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — Niemann Family Finances</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
  <div class="toolbar">
    <span class="brand">Niemann Family Finances · ${escapeHtml(title)}</span>
    <div class="actions">
      <a href="${otherLink}">${escapeHtml(otherLabel)}</a>
      <button class="primary" onclick="window.print()">⎙ Print / Save as PDF</button>
    </div>
  </div>
${body}
</div>
</body>
</html>
`

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Rewrite "MANUAL.md" / "README.md" links to point at their .html siblings. */
function rewriteMdLinks(html) {
  return html
    .replace(/href="(?:\.\/)?MANUAL\.md([^"]*)"/g, 'href="MANUAL.html$1"')
    .replace(/href="(?:\.\/)?README\.md([^"]*)"/g, 'href="README.html$1"')
}

async function convert(inputPath, outputPath, title, otherLink, otherLabel) {
  const md = await readFile(resolve(root, inputPath), 'utf8')
  marked.setOptions({ gfm: true, breaks: false })
  const rendered = rewriteMdLinks(marked.parse(md))
  const html = template({ title, body: rendered, otherLink, otherLabel })
  await writeFile(resolve(root, outputPath), html, 'utf8')
  console.log(`✓ wrote ${outputPath}`)
}

await convert('README.md', 'README.html', 'Read me', 'MANUAL.html', 'Open full manual →')
await convert('MANUAL.md', 'MANUAL.html', 'User manual', 'README.html', '← Back to read me')
