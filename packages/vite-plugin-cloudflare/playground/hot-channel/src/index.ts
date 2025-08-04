import.meta.hot?.on("server-event", (payload) => {
	console.log(`__${payload}-received__`);
	import.meta.hot?.send("worker-event", "worker-module-event-data");
});

// Needed to log here rather than in the test-plugin in order for it to appear in `serverLogs`
import.meta.hot?.on("worker-event-received", (payload) => {
	console.log(`__${payload}-received__`);
});

export default {
	async fetch() {
		if (import.meta.hot) {
			import.meta.hot.send("worker-event", "worker-request-event-data");
		}
		return new Response("OK");
	},
} satisfies ExportedHandler;
