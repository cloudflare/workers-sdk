let lastTriggeredCron: string | null = null;

async function fetchMock() {
	const response = await fetch(`http://example.com/auxiliary`);
	return await response.text();
}

export default {
	async fetch() {
		return Response.json({
			worker: "auxiliary",
			mockResult: await fetchMock(),
			lastTriggeredCron,
		});
	},
	async scheduled(event) {
		lastTriggeredCron = event.cron;
	},
} satisfies ExportedHandler;
