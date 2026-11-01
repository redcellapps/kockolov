// Builds public/lego-catalog.json — every LEGO set ever made, so classifieds can fill in name, theme, year and pieces
// for sets Kockolov does not track. Source: Rebrickable's free CSV downloads (https://rebrickable.com/downloads/).
//
//   download sets.csv.gz and themes.csv.gz, then:
//   node web/scripts/build-catalog.mjs path/to/sets.csv.gz path/to/themes.csv.gz
//
// Output: { "75192": ["Millennium Falcon", 2017, 7541, "Star Wars", "Ultimate Collector Series"], ... }
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [setsFile, themesFile] = process.argv.slice(2);
if (!setsFile || !themesFile) {
  console.error('usage: node build-catalog.mjs sets.csv[.gz] themes.csv[.gz]');
  process.exit(1);
}
const read = (f) => {
  const b = readFileSync(f);
  return (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8');
};
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...data] = rows;
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const themes = new Map(parseCsv(read(themesFile)).map((t) => [t.id, t]));
const rootOf = (id) => {
  let t = themes.get(id);
  while (t?.parent_id && themes.get(t.parent_id)) t = themes.get(t.parent_id);
  return t;
};
const out = {};
for (const s of parseCsv(read(setsFile))) {
  const m = s.set_num.match(/^(\d{4,6})-1$/); // the main version of numeric sets (not minifigure variants or polybags with letters)
  if (!m) continue;
  const leaf = themes.get(s.theme_id);
  const root = rootOf(s.theme_id);
  out[m[1]] = [s.name, Number(s.year) || 0, Number(s.num_parts) || 0, root?.name ?? '', leaf && leaf !== root ? leaf.name : null];
}
writeFileSync(new URL('../public/lego-catalog.json', import.meta.url), JSON.stringify(out));
console.log(`${Object.keys(out).length} sets -> web/public/lego-catalog.json`);
