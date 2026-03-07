let lastScheduledMock = "not-run";

async function fetchMock(phase: "fetch" | "scheduled") {
	const response = await fetch(`http://example.com/primary/${phase}`);
	return await response.text();
}

export default {
	async fetch() {
		const fetchMockValue = await fetchMock("fetch");
		return Response.json({
			worker: "primary",
			fetchMock: fetchMockValue,
			lastScheduledMock,
		});
	},
	async scheduled() {
		lastScheduledMock = await fetchMock("scheduled");
	},
};
