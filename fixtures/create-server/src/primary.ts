let lastTriggeredCron: string | null = null;

async function fetchMock() {
	const response = await fetch(`http://example.com/primary`);
	return await response.text();
}

export default {
	async fetch() {
		return Response.json({
			worker: "primary",
			mockResult: await fetchMock(),
			lastTriggeredCron,
		});
	},
	async scheduled(event) {
		lastTriggeredCron = event.cron;
	},
} satisfies ExportedHandler;
