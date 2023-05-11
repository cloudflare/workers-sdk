<script setup>
	import { RouterLink } from 'vue-router';
</script>

<template>
	<main>
		<h2>Blog posts</h2>

		<div>
			<h3>
				<RouterLink to="/hello-world">
					Hello World - <datetime>August 12, 2022</datetime>
				</RouterLink>
			</h3>
		</div>
	</main>
</template>
