<script setup>
	import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
	<header>
		<h1>My Blog</h1>
		<nav>
			<RouterLink to="/">Home</RouterLink> |
			<RouterLink to="/hello-world">Hello World Blog Post</RouterLink>
		</nav>
	</header>

	<RouterView />
</template>
