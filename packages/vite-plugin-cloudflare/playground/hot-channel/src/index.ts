import.meta.hot?.on("server-event", (payload) => {
	console.log(`__${payload}-received__`);
	import.meta.hot?.send("client-event", "client-event-data");
});

// Needed to log here rather than in the test-plugin in order for it to appear in `serverLogs`
import.meta.hot?.on("client-event-received", (payload) => {
	console.log(`__${payload}-received__`);
});

export default {
	async fetch() {
		return new Response("OK");
	},
} satisfies ExportedHandler;
