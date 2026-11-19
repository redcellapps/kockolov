/** Crni petak (Black Friday) 2026; the page /crni-petak stays, the menu link and home strip only until then */
export const BLACK_FRIDAY = '2026-11-27';
const LINK_UNTIL = Date.parse('2026-12-01T00:00:00+01:00');

/** The "Crni petak" link in the menu and the strip on the home page show until 30 November */
export const showBlackFriday = (now = Date.now()) => now < LINK_UNTIL;
