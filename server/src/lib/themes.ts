import { normalizeText } from './normalize.js';

export interface ThemeDef {
  slug: string;
  name: string;
  /** normalized phrases; a raw shop category matches if it contains one of them */
  match: string[];
  /** extra words added to search text (Serbian spellings, English names) */
  search?: string[];
}

// Order matters: specific themes come before generic ones ("creator expert" before "creator"),
// and it decides which theme wins when a shop lists several.
export const THEMES: ThemeDef[] = [
  // DUPLO first: a DUPLO Spidey set is bought as a toddler toy, not as a Marvel set
  { slug: 'duplo', name: 'DUPLO', match: ['duplo'], search: ['za bebe', 'za najmladje'] },
  { slug: 'harry-potter', name: 'Harry Potter', match: ['harry potter', 'hari poter'], search: ['hari poter', 'hogvorts', 'hogwarts'] },
  { slug: 'star-wars', name: 'Star Wars', match: ['star wars'], search: ['ratovi zvezda'] },
  { slug: 'marvel', name: 'Marvel', match: ['marvel', 'spider man', 'spiderman', 'spidey', 'spajdi', 'avengers', 'osvetnici'], search: ['super heroji', 'super heroes'] },
  { slug: 'dc', name: 'DC', match: ['dc', 'dc comics', 'batman', 'betmen'], search: ['betmen', 'batman', 'super heroji', 'super heroes'] },
  { slug: 'super-heroes', name: 'Super Heroes', match: ['super heroes', 'super heroji', 'superheroes'], search: ['marvel', 'dc'] },
  { slug: 'city', name: 'City', match: ['city'], search: ['grad'] },
  { slug: 'friends', name: 'Friends', match: ['friends'] },
  { slug: 'technic', name: 'Technic', match: ['technic', 'tehnik'] },
  { slug: 'ninjago', name: 'NINJAGO', match: ['ninjago'] },
  { slug: 'minecraft', name: 'Minecraft', match: ['minecraft'] },
  { slug: 'botanicals', name: 'Botanicals', match: ['botanical', 'botanicals', 'botanicka'], search: ['cvece', 'buket', 'flowers'] },
  { slug: 'icons', name: 'Icons', match: ['icons', 'creator expert'], search: ['za odrasle'] },
  { slug: 'creator', name: 'Creator 3u1', match: ['creator 3in1', 'creator 3 u 1', 'creator 3u1', 'creator'], search: ['3u1', '3 u 1', '3in1'] },
  { slug: 'ideas', name: 'Ideas', match: ['ideas'] },
  { slug: 'architecture', name: 'Architecture', match: ['architecture', 'arhitektura'], search: ['arhitektura'] },
  { slug: 'art', name: 'Art', match: ['lego art', 'art 18', 'art'], search: ['slika', 'mozaik'] },
  { slug: 'speed-champions', name: 'Speed Champions', match: ['speed champions', 'sampioni brzine'], search: ['sampioni brzine', 'automobili'] },
  { slug: 'disney', name: 'Disney', match: ['disney', 'frozen', 'princess'], search: ['diznij', 'princeze'] },
  { slug: 'classic', name: 'Classic', match: ['classic'], search: ['kreativne kocke'] },
  { slug: 'dreamzzz', name: 'DREAMZzz', match: ['dreamzzz'] },
  { slug: 'super-mario', name: 'Super Mario', match: ['super mario', 'mario kart'], search: ['mario'] },
  { slug: 'jurassic-world', name: 'Jurassic World', match: ['jurassic', 'svet iz doba jure'], search: ['dinosaurusi', 'jurski park'] },
  { slug: 'lord-of-the-rings', name: 'Gospodar prstenova', match: ['lord of the rings', 'gospodar prstenova', 'hobbit'], search: ['lord of the rings'] },
  { slug: 'sonic', name: 'Sonic', match: ['sonic'] },
  { slug: 'animal-crossing', name: 'Animal Crossing', match: ['animal crossing'] },
  { slug: 'fortnite', name: 'Fortnite', match: ['fortnite'] },
  { slug: 'one-piece', name: 'One Piece', match: ['one piece'] },
  { slug: 'pokemon', name: 'Pokémon', match: ['pokemon'] },
  { slug: 'zelda', name: 'Zelda', match: ['zelda'] },
  { slug: 'gabbys-dollhouse', name: "Gabby's Dollhouse", match: ['gabby', 'gabina'], search: ['gabina kucica za lutke'] },
  { slug: 'wednesday', name: 'Wednesday', match: ['wednesday', 'sreda'] },
  { slug: 'wicked', name: 'Wicked', match: ['wicked', 'zlica'] },
  { slug: 'minions', name: 'Minions', match: ['minions', 'malci'], search: ['malci'] },
  { slug: 'bluey', name: 'Bluey', match: ['bluey'] },
  { slug: 'peppa-pig', name: 'Peppa Pig', match: ['peppa', 'pepa prase'], search: ['pepa prase'] },
  { slug: 'kpop-demon-hunters', name: 'KPop Demon Hunters', match: ['kpop'] },
  { slug: 'horizon', name: 'Horizon', match: ['horizon'] },
  { slug: 'shrek', name: 'Šrek', match: ['shrek', 'srek'] },
  { slug: 'brickheadz', name: 'BrickHeadz', match: ['brickheadz'] },
  { slug: 'minifigures', name: 'Minifigure', match: ['minifigures', 'minifigure', 'minifigura'], search: ['minifigure', 'minifigurice'] },
  { slug: 'editions', name: 'Editions', match: ['editions'] },
  { slug: 'chinese-festivals', name: 'Kineske proslave', match: ['chinese festivals', 'kineske proslave'] },
  { slug: 'iconic', name: 'Iconic', match: ['iconic'] },
];

export const THEME_BY_SLUG = new Map(THEMES.map((t) => [t.slug, t]));

// Shop categories that say nothing about the theme
const GENERIC = [
  'lego kocke', 'lego', 'igracke za decu', 'ostali lego setovi i dodaci', 'lego modeli za odrasle', 'modeli za odrasle',
  'girls gwp', 'lego 4+', '4+', 'lego formula 1', 'formula 1', 'univerzalne igracke', 'lego prazni', 'novo',
];

/** Map one raw category string from a shop to a canonical theme slug. */
export function themeFromRaw(raw: string): string | null {
  const n = normalizeText(raw).replace(/^lego\s+/, '');
  if (!n) return null;
  if (GENERIC.includes(n) || GENERIC.includes(`lego ${n}`)) return null;
  const padded = ` ${n} `;
  for (const t of THEMES) {
    for (const m of t.match) {
      if (padded.includes(` ${m} `)) return t.slug;
    }
  }
  return null;
}

/** First theme found in a list of raw categories (e.g. Kockarium lists several per product). */
export function themeFromList(raws: string[] | null | undefined): string | null {
  if (!raws) return null;
  const found = raws.map(themeFromRaw).filter((x): x is string => !!x);
  if (!found.length) return null;
  // prefer the most specific (earliest in THEMES order)
  const order = new Map(THEMES.map((t, i) => [t.slug, i]));
  found.sort((a, b) => (order.get(a)! - order.get(b)!));
  return found[0];
}

const DC_WORDS = ['batman', 'betmen', 'betmobil', 'batmobile', 'dzoker', 'joker', 'superman', 'supermen', 'wonder woman', 'aquaman', 'akvamen', 'flash', 'harley', 'gotham', 'getam', 'robin'];
const MARVEL_WORDS = ['spider', 'spajd', 'iron man', 'ajronmen', 'ajron men', 'avengers', 'osvetn', 'hulk', 'halk', 'thor', 'kapetan amerika', 'captain america', 'x men', 'venom', 'groot', 'grut', 'guardians', 'cuvari galaksije', 'wolverine', 'deadpool', 'dedpul', 'black panther', 'crni panter', 'strange', 'strejndz', 'wakanda', 'vakanda', 'thanos', 'tanos', 'loki', 'marvel', 'ultron', 'altron', 'daredevil', 'doktor dum', 'doctor doom', 'carnage'];

/** "Super Heroes" is both Marvel and DC at the LEGO Store — split using the title. */
export function refineSuperHeroes(title: string): 'marvel' | 'dc' | null {
  const n = ` ${normalizeText(title)} `;
  if (DC_WORDS.some((w) => n.includes(` ${w}`))) return 'dc';
  if (MARVEL_WORDS.some((w) => n.includes(` ${w}`))) return 'marvel';
  return null;
}
