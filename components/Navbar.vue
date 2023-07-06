<template>
  <nav class="navbar">
    <div class="container">
      <div class="navbar-brand">
        <nuxt-link to="/" class="navbar-item">Home</nuxt-link>
      </div>
      <div class="navbar-menu">
        <div class="navbar-end">
          <nuxt-link to="/about" class="navbar-item">About</nuxt-link>
        </div>
      </div>
    </div>
  </nav>
</template>

<script>
export default {
  name: 'Navbar'
}
</script>

<style scoped>
.navbar {
  background-color: #333;
  color: #fff;
}
.navbar-item {
  color: #fff;
}
</style>