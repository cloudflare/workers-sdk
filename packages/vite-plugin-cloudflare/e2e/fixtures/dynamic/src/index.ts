export default {
	async fetch() {
		// By dynamically importing the `./dynamic` module we prevent Vite from being able to statically
		// analyze the imports and pre-optimize the Node.js import that is within it.
		const { x } = await import("./dynamic");
		return new Response(x);
	},
} satisfies ExportedHandler;
