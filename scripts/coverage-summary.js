#!/usr/bin/env node
/**
 * Summarise a coverlet Cobertura report by API area (problemList T11).
 *
 * The single headline line-rate is misleading: generated EF migrations are a
 * large share of the API's lines and no test runs them, so they drag the
 * number down without saying anything about the code people write. This
 * prints line coverage per Features/<area> (plus Common and the rest), with
 * Migrations reported separately and excluded from the total.
 *
 * USAGE
 *   node scripts/coverage-summary.js <coverage.cobertura.xml> [--markdown]
 *
 * --markdown prints a table for $GITHUB_STEP_SUMMARY; otherwise plain text.
 * Informational only — it never fails a build.
 */
const fs = require('node:fs');

const [file, ...flags] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) {
  console.error(`coverage-summary: no report at ${file ?? '(missing argument)'}`);
  process.exit(0);
}
const md = flags.includes('--markdown');
const xml = fs.readFileSync(file, 'utf8');

// Each <class> carries its filename and its <line hits="n"> rows. A file can
// appear as several classes (nested/async state machines), and the same line
// can be listed by more than one of them, so count unique lines per file.
const byFile = new Map();   // filename -> Map(lineNumber -> covered)
const classRe = /<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
const lineRe  = /<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g;
for (const [, filename, body] of xml.matchAll(classRe)) {
  const lines = byFile.get(filename) ?? new Map();
  for (const [, n, hits] of body.matchAll(lineRe)) {
    lines.set(n, lines.get(n) || Number(hits) > 0);
  }
  byFile.set(filename, lines);
}

function areaOf(filename) {
  const f = filename.replace(/\\/g, '/');
  if (/(^|\/)Migrations\//.test(f)) return 'Migrations';
  const feature = f.match(/(?:^|\/)Features\/([^/]+)\//);
  if (feature) return `Features/${feature[1]}`;
  if (/(^|\/)Common\//.test(f)) return 'Common';
  return 'Other (Program, Data, …)';
}

const areas = new Map();
for (const [filename, lines] of byFile) {
  const a = areas.get(areaOf(filename)) ?? { covered: 0, total: 0 };
  for (const covered of lines.values()) { a.total++; if (covered) a.covered++; }
  areas.set(areaOf(filename), a);
}

const pct = a => (a.total ? (100 * a.covered / a.total) : 0);
const rows = [...areas.entries()]
  .filter(([name]) => name !== 'Migrations')
  .sort((x, y) => pct(x[1]) - pct(y[1]));
const total = rows.reduce((t, [, a]) => ({ covered: t.covered + a.covered, total: t.total + a.total }),
                          { covered: 0, total: 0 });
const mig = areas.get('Migrations');

if (md) {
  console.log('### API line coverage (excluding EF migrations)\n');
  console.log(`**${pct(total).toFixed(1)}%** — ${total.covered} of ${total.total} lines` +
              (mig ? ` · migrations (${mig.total} lines) excluded` : '') + '\n');
  console.log('| Area | Coverage | Lines |');
  console.log('|---|---:|---:|');
  for (const [name, a] of rows) console.log(`| ${name} | ${pct(a).toFixed(1)}% | ${a.covered}/${a.total} |`);
} else {
  console.log(`API line coverage, excluding EF migrations: ${pct(total).toFixed(1)}% ` +
              `(${total.covered}/${total.total})` + (mig ? `; migrations ${mig.total} lines excluded` : ''));
  for (const [name, a] of rows) {
    console.log(`  ${pct(a).toFixed(1).padStart(5)}%  ${String(a.covered).padStart(5)}/${String(a.total).padEnd(5)}  ${name}`);
  }
}
