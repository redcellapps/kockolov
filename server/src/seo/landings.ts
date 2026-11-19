import type { SearchFilters } from '../api/search.js';

/*
 * Pages for the way people search before buying a present: a price limit, a child's age. Each is the set
 * list with those filters set (web/src/lib/landings.ts has the same addresses and filters for the page
 * itself), with its own title, heading and an intro in sentences.
 */
export interface Landing {
  path: string;
  filters: Pick<SearchFilters, 'max' | 'ages'>;
  /** the heading (H1) and the start of the title */
  heading: string;
  /** what the page is, one sentence before the numbers */
  intro: string;
}

export const LANDINGS: Landing[] = [
  {
    path: '/pokloni/do-2000-dinara',
    filters: { max: 2000 },
    heading: 'LEGO pokloni do 2.000 dinara',
    intro: 'LEGO setovi koje u nekoj prodavnici u Srbiji možeš da kupiš za najviše 2.000 dinara: sitni pokloni, minifigure i mali setovi.',
  },
  {
    path: '/pokloni/do-5000-dinara',
    filters: { max: 5000 },
    heading: 'LEGO pokloni do 5.000 dinara',
    intro: 'LEGO setovi koje u nekoj prodavnici u Srbiji možeš da kupiš za najviše 5.000 dinara, za rođendan, Novu godinu ili bez povoda.',
  },
  {
    path: '/pokloni/do-10000-dinara',
    filters: { max: 10000 },
    heading: 'LEGO pokloni do 10.000 dinara',
    intro: 'LEGO setovi koje u nekoj prodavnici u Srbiji možeš da kupiš za najviše 10.000 dinara, od malih do pravih velikih poklona.',
  },
  {
    path: '/uzrast/1-3-godine',
    filters: { ages: ['1-3'] },
    heading: 'LEGO za decu od 1 do 3 godine',
    intro: 'LEGO setovi za najmlađe, od 1 do 3 godine (uglavnom DUPLO, sa velikim kockama), po uzrastu koji navodi LEGO.',
  },
  {
    path: '/uzrast/4-6-godina',
    filters: { ages: ['4-6'] },
    heading: 'LEGO za decu od 4 do 6 godina',
    intro: 'LEGO setovi za decu od 4 do 6 godina, po uzrastu koji navodi LEGO: jednostavni modeli za prvu samostalnu gradnju.',
  },
  {
    path: '/uzrast/7-9-godina',
    filters: { ages: ['7-9'] },
    heading: 'LEGO za decu od 7 do 9 godina',
    intro: 'LEGO setovi za decu od 7 do 9 godina, po uzrastu koji navodi LEGO.',
  },
  {
    path: '/uzrast/10-13-godina',
    filters: { ages: ['10-13'] },
    heading: 'LEGO za decu od 10 do 13 godina',
    intro: 'LEGO setovi za decu od 10 do 13 godina, po uzrastu koji navodi LEGO: veći i zahtevniji modeli.',
  },
  {
    path: '/uzrast/14-17-godina',
    filters: { ages: ['14-17'] },
    heading: 'LEGO za tinejdžere od 14 do 17 godina',
    intro: 'LEGO setovi za tinejdžere od 14 do 17 godina, po uzrastu koji navodi LEGO.',
  },
  {
    path: '/uzrast/za-odrasle',
    filters: { ages: ['18'] },
    heading: 'LEGO za odrasle (18+)',
    intro: 'LEGO setovi za odrasle (18+): detaljni modeli za izlaganje i kolekcionare, po uzrastu koji navodi LEGO.',
  },
];

export const landingFor = (path: string) => LANDINGS.find((l) => l.path === path) ?? null;
