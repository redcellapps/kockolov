import { readFileSync, writeFileSync } from 'node:fs';
import { eurRate } from '../fx.js';
import { xlsx, type XlsxCell } from '../lib/xlsx.js';
import { catalogFile, knownSets, loadCatalog } from './catalog.js';
import { classifyAd, type KpCondition, type KpDecision, type ReviewReason, type SkipReason } from './classify.js';
import { listingFromKp, type KpListing } from './parse.js';

/*
 * Trial report: every KP ad the agent saved (kp-oglasi.jsonl, `kp-agent.mjs --sve`) with what Kockolov
 * would do with it and why, as an Excel sheet. Nothing is stored. `kp:izvestaj <file> [--out x.xlsx]`
 */

const SKIP: Record<SkipReason, string> = {
  wanted: 'Kupujem / menjam',
  not_lego: 'Nije LEGO (kopija, kompatibilno)',
  bulk: 'Kocke na kilo / miks',
  promo: 'Promo',
  not_a_set: 'Nije set (igrica, figura, uputstvo, rasveta…)',
  damaged: 'Oštećeno',
  no_price: 'Bez cene',
  no_number: 'Nema broja seta',
  multi: 'Više setova u oglasu',
};
const REVIEW: Record<ReviewReason, string> = {
  name: 'Naslov pominje drugu temu',
  price: 'Cena nije realna',
  more_numbers: 'U opisu i drugi setovi',
  number_in_text: 'Broj seta samo u opisu',
};
const CONDITION: Record<KpCondition, string> = { novo: 'Novo', nekorisceno: 'Nekorišćeno', korisceno: 'Korišćeno', osteceno: 'Oštećeno' };
const ORDER = { show: 0, review: 1, skip: 2 } as const;

export async function kpReport(file: string, out: string, log: (m: string) => void = console.log): Promise<Record<string, number>> {
  const ads: KpListing[] = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => listingFromKp(JSON.parse(l)));
  const catFile = catalogFile();
  const catalog = loadCatalog(catFile);
  log(catFile ? `katalog: ${catalog.size} setova (${catFile})` : 'katalog nije nađen: poznati su samo naši setovi');
  const known = await knownSets(catalog);
  const ctx = { known, eurRate: (await eurRate()).rate };

  const rows = ads.map((a) => ({ a, d: classifyAd(a, ctx) as KpDecision }));
  rows.sort((x, y) => ORDER[x.d.kind] - ORDER[y.d.kind] || reason(x.d).localeCompare(reason(y.d)) || setOf(x.d).localeCompare(setOf(y.d)));

  const counts: Record<string, number> = {};
  for (const { d } of rows) {
    const k = d.kind === 'show' ? 'Prikazuje se' : `${d.kind === 'review' ? 'Za proveru' : 'Preskočeno'}: ${reason(d)}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }

  const cells: XlsxCell[][] = rows.map(({ a, d }) => {
    const set = setOf(d) ? known(setOf(d)) : null;
    return [
      d.kind === 'show' ? 'Prikazuje se' : d.kind === 'review' ? 'Za proveru' : 'Preskočeno',
      d.kind === 'show' ? '' : reason(d),
      setOf(d) || ('setNums' in d && d.setNums ? d.setNums.join(', ') : ''),
      set?.names[0] ?? '',
      a.title,
      a.priceText,
      'priceRsd' in d ? d.priceRsd : null,
      set?.rrp ?? null,
      CONDITION[a.condition],
      a.location,
      a.postedAt?.slice(0, 10) ?? '',
      a.snippet,
      a.url,
    ];
  });
  const book = xlsx(
    'KP oglasi',
    [
      { header: 'Odluka', width: 14 },
      { header: 'Razlog', width: 30 },
      { header: 'Set', width: 10 },
      { header: 'Naziv seta', width: 34 },
      { header: 'Naslov oglasa', width: 56 },
      { header: 'Cena', width: 12 },
      { header: 'Cena (RSD)', width: 12, kind: 'number' },
      { header: 'Redovna cena LEGO Store (RSD)', width: 16, kind: 'number' },
      { header: 'Stanje', width: 13 },
      { header: 'Mesto', width: 16 },
      { header: 'Postavljen', width: 11 },
      { header: 'Početak opisa', width: 50 },
      { header: 'Link', width: 60 },
    ],
    cells,
  );
  writeFileSync(out, book);
  log(`${ads.length} oglasa → ${out}`);
  return counts;
}

function reason(d: KpDecision): string {
  return d.kind === 'skip' ? SKIP[d.why] : d.kind === 'review' ? REVIEW[d.why] : '';
}
function setOf(d: KpDecision): string {
  return d.kind === 'skip' ? '' : d.setNum;
}
