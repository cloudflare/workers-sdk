let lastTriggeredCron: string | null = null;

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/scheduled") {
			return new Response(lastTriggeredCron ?? "no cron triggered", {
				headers: { "Content-Type": "text/plain" },
			});
		}

		return fetch("http://example.com/auxiliary");
	},
	async scheduled(event) {
		lastTriggeredCron = event.cron;
	},
} satisfies ExportedHandler<{ NAME: string }>;
