import { unstable_dev } from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (init?: RequestInit) => Promise<Response | undefined>;
		stop: () => Promise<void>;
	};

	beforeAll(async () => {
		worker = await unstable_dev(
			"src/headers.ts",
			{},
			{ disableExperimentalWarning: true }
		);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("should return Hi by default", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
		}
	});
	it("should return Bonjour when French", async () => {
		const resp = await worker.fetch({ headers: { lang: "fr-FR" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Bonjour!" }));
		}
	});

	it("should return G'day when Australian", async () => {
		const resp = await worker.fetch({ headers: { lang: "en-AU" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "G'day!" }));
		}
	});

	it("should return Good day when British", async () => {
		const resp = await worker.fetch({ headers: { lang: "en-GB" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Good day!" }));
		}
	});

	it("should return Howdy when Texan", async () => {
		const resp = await worker.fetch({ headers: { lang: "en-TX" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Howdy!" }));
		}
	});

	it("should return Hello when American", async () => {
		const resp = await worker.fetch({ headers: { lang: "en-US" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hello!" }));
		}
	});

	it("should return Hola when Spanish", async () => {
		const resp = await worker.fetch({ headers: { lang: "es-ES" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hola!" }));
		}
	});
});
