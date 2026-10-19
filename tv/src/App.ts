import Blits from '@lightningjs/blits'
import Home from './pages/Home'
import SetPage from './pages/Set'
import Placeholder from './pages/Placeholder'

// The new page fades in; the old one is hidden at once (a timed fade-out of a kept-alive page
// was seen to stop halfway and stay drawn over the new page).
const pageTransition = {
  before: { prop: 'alpha', value: 0 },
  in: { prop: 'alpha', value: 1 },
  out: { prop: 'alpha', value: 0 },
}

export default Blits.Application({
  template: `
    <Element w="1920" h="1080" color="#16150f">
      <RouterView />
    </Element>`,
  routes: [
    { path: '/', component: Home, options: { keepAlive: true }, transition: pageTransition },
    { path: '/set/:setnum', component: SetPage, options: { backtrack: true } as never, transition: pageTransition },
    { path: '/pretraga', component: Placeholder, transition: pageTransition },
    { path: '/teme', component: Placeholder, transition: pageTransition },
    { path: '/teme/:slug', component: Placeholder, transition: pageTransition },
    { path: '/o-aplikaciji', component: Placeholder, transition: pageTransition },
  ],
})
