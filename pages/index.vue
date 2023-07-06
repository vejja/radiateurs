<template>
  <div>
    <Navbar />
    <h1>Welcome to our Nuxt.js website!</h1>
  </div>
</template>

<script>
import Navbar from '~/components/Navbar.vue'

export default {
  components: {
    Navbar
  }
}
</script>

<style scoped>
h1 {
  color: #333;
}
</style>