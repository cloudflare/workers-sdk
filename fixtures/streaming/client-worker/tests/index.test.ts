import assert from "node:assert";
import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../../shared/src/run-wrangler-long-lived";

describe("'wrangler dev' streaming responses through a service binding", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, "../.."), [
			"--port=0",
			"--inspector-port=0",
			"-c",
			"client-worker/wrangler.jsonc",
			"-c",
			"main-worker/wrangler.jsonc",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it.for([null, "gzip", "br", "identity"])(
		"preserves acceptable Worker encoding %s through a service binding",
		async (encoding, { expect }) => {
			const compressionParam =
				encoding === null ? "" : `?compression=${encoding}`;
			const response = await fetch(
				`http://${ip}:${port}/streaming${compressionParam}`,
				{
					headers: { "accept-encoding": "gzip, br" },
				}
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toBe(
				encoding === "identity" ? null : encoding
			);
			assert(response.body);
			const reader = response.body.getReader();
			try {
				const first = await reader.read();
				let content = new TextDecoder().decode(first.value);
				if (encoding === null || encoding === "identity") {
					expect(content).not.toContain("<div>END</div>");
				}
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					content += new TextDecoder().decode(value);
				}
				expect(content).toContain("<div>START</div>");
				expect(content).toContain("<div>test 0");
				expect(content).toContain("<div>test 4");
				expect(content).toContain("<div>END</div>");
			} finally {
				reader.releaseLock();
			}
		}
	);
});
