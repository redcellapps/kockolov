import Blits from '@lightningjs/blits'
import Home from './pages/Home'
import SetPage from './pages/Set'
import Search from './pages/Search'
import Themes from './pages/Themes'
import ThemeSets from './pages/ThemeSets'
import About from './pages/About'
import Pair from './pages/Pair'
import Account from './pages/Account'
import Watchlist from './pages/Watchlist'

// Page switches are instant and nothing is animated by the router: `before` is applied directly, and
// with no `in`/`out` the router has no animation promise to wait for. Animated transitions (even with
// duration 0) were seen to never finish in Chrome, which left the router "navigating" and every key
// dead, or the new page half-transparent. Revisit on a real TV before adding fades.
const pageTransition = {
  before: { prop: 'alpha', value: 1 },
}

export default Blits.Application({
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <RouterView />
    </Element>`,
  routes: [
    { path: '/', component: Home, options: { keepAlive: true }, transition: pageTransition },
    { path: '/set/:setnum', component: SetPage, options: { backtrack: true } as never, transition: pageTransition },
    { path: '/pretraga', component: Search, options: { keepAlive: true }, transition: pageTransition },
    { path: '/teme', component: Themes, options: { keepAlive: true }, transition: pageTransition },
    { path: '/teme/:slug', component: ThemeSets, options: { backtrack: true } as never, transition: pageTransition },
    { path: '/o-aplikaciji', component: About, transition: pageTransition },
    { path: '/prijava', component: Pair, transition: pageTransition },
    { path: '/nalog', component: Account, transition: pageTransition },
    { path: '/praceno', component: Watchlist, options: { keepAlive: true }, transition: pageTransition },
  ],
})
