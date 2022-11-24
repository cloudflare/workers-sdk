import { resolve } from "path";
import { unstable_dev } from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (
			input?: RequestInfo,
			init?: RequestInit
		) => Promise<Response | undefined>;
		stop: () => Promise<void>;
	};
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		worker = await unstable_dev(
			resolve(__dirname, "..", "src", "headers.ts"),
			{},
			{ disableExperimentalWarning: true }
		);

		resolveReadyPromise(undefined);
	});

	afterAll(async () => {
		await worker.stop();
	});

	it.concurrent("should return Hi by default", async () => {
		await readyPromise;
		const resp = await worker.fetch("/");
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hi!" }));
		}
	});
	it.concurrent("should return Bonjour when French", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "fr-FR" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Bonjour!" }));
		}
	});

	it.concurrent("should return G'day when Australian", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "en-AU" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "G'day!" }));
		}
	});

	it.concurrent("should return Good day when British", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "en-GB" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Good day!" }));
		}
	});

	it.concurrent("should return Howdy when Texan", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "en-TX" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Howdy!" }));
		}
	});

	it.concurrent("should return Hello when American", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "en-US" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hello!" }));
		}
	});

	it.concurrent("should return Hola when Spanish", async () => {
		await readyPromise;
		const resp = await worker.fetch("/", { headers: { lang: "es-ES" } });
		expect(resp).not.toBe(undefined);
		if (resp) {
			const respJson = await resp.text();
			expect(respJson).toBe(JSON.stringify({ greeting: "Hola!" }));
		}
	});
});
