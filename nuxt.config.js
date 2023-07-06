module.exports = {
  head: {
    title: 'Nuxt Website',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: 'My Nuxt.js website' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },
  css: [
    '~/assets/css/main.css'
  ],
  plugins: [
    '~/plugins/bootstrap-vue.js'
  ],
  components: true,
  buildModules: [
  ],
  modules: [
    '@nuxtjs/axios',
  ],
  axios: {},
  build: {
    extend(config, ctx) {
    }
  },
  serverMiddleware: [
    '~/middleware/auth.js'
  ],
  router: {
    middleware: 'auth'
  }
}