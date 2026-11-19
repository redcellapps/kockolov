import type { TKey } from '../i18n';

/*
 * Gift and age pages: the set list with a price limit or an age picked, at their own address, with a
 * heading and an intro (the server has the same list in server/src/seo/landings.ts for titles and the sitemap).
 */
export interface Landing {
  path: string;
  /** the filters the address stands for */
  params: Record<string, string>;
  heading: TKey;
  intro: TKey;
  /** the short name in the footer */
  short: TKey;
  group: 'gift' | 'age';
}

export const LANDINGS: Landing[] = [
  { path: '/pokloni/do-2000-dinara', params: { max: '2000' }, heading: 'landing.gift2000', intro: 'landing.gift2000.intro', short: 'landing.gift2000.short', group: 'gift' },
  { path: '/pokloni/do-5000-dinara', params: { max: '5000' }, heading: 'landing.gift5000', intro: 'landing.gift5000.intro', short: 'landing.gift5000.short', group: 'gift' },
  { path: '/pokloni/do-10000-dinara', params: { max: '10000' }, heading: 'landing.gift10000', intro: 'landing.gift10000.intro', short: 'landing.gift10000.short', group: 'gift' },
  { path: '/uzrast/1-3-godine', params: { age: '1-3' }, heading: 'landing.age1', intro: 'landing.age1.intro', short: 'landing.age1.short', group: 'age' },
  { path: '/uzrast/4-6-godina', params: { age: '4-6' }, heading: 'landing.age4', intro: 'landing.age4.intro', short: 'landing.age4.short', group: 'age' },
  { path: '/uzrast/7-9-godina', params: { age: '7-9' }, heading: 'landing.age7', intro: 'landing.age7.intro', short: 'landing.age7.short', group: 'age' },
  { path: '/uzrast/10-13-godina', params: { age: '10-13' }, heading: 'landing.age10', intro: 'landing.age10.intro', short: 'landing.age10.short', group: 'age' },
  { path: '/uzrast/14-17-godina', params: { age: '14-17' }, heading: 'landing.age14', intro: 'landing.age14.intro', short: 'landing.age14.short', group: 'age' },
  { path: '/uzrast/za-odrasle', params: { age: '18' }, heading: 'landing.age18', intro: 'landing.age18.intro', short: 'landing.age18.short', group: 'age' },
];

export const landingFor = (path: string) => LANDINGS.find((l) => l.path === path) ?? null;
