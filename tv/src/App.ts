import Blits from '@lightningjs/blits'
import Home from './pages/Home'
import SetPage from './pages/Set'
import Search from './pages/Search'
import Themes from './pages/Themes'
import ThemeSets from './pages/ThemeSets'
import About from './pages/About'

// Page switches are instant. Animated page transitions (even 200 ms alpha fades) were seen to stall
// half-way in Chromium until the next key press, leaving the new page dim or the old one on top —
// revisit on a real TV before adding fades.
const pageTransition = {
  before: { prop: 'alpha', value: 0 },
  in: { prop: 'alpha', value: 1, duration: 0 },
  out: { prop: 'alpha', value: 0, duration: 0 },
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
  ],
})
