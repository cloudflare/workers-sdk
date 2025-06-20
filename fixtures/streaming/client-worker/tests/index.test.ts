import assert from "assert";
import { resolve } from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../../shared/src/run-wrangler-long-lived";
import type { Response } from "undici";

describe("'wrangler dev' streaming responses", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
			"-c main-worker/wrangler.toml",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	describe.concurrent.each(["<default>", "gzip", "br", "identity"])(
		"encoding set to %s",
		(compression) => {
			it("streams response chunks over time", async ({ expect }) => {
				const compressionParam =
					compression === "<default>" ? "" : `?compression=${compression}`;
				const response = await fetch(
					`http://${ip}:${port}/streaming${compressionParam}`
				);
				expect(response.status).toBe(200);
				expect(response.body).toBeTruthy();
				expect(response.headers.get("content-encoding")).toEqual(
					compression === "<default>" ? null : compression
				);

				const { chunks, timestamps } = await readBody(response);

				const fullContent = chunks.join("");

				// Verify we received the expected content structure
				expect(fullContent).toContain("<div>START</div>");
				expect(fullContent).toContain("<div>test 0");
				expect(fullContent).toContain("<div>test 4");
				expect(fullContent).toContain("<div>END</div>");

				// The gzip and brotli responses do not fill the streaming buffer so they are sent in a single chunk.
				if (compression !== "gzip" && compression !== "br") {
					// Verify we received multiple a chunk for each delayed piece of content.
					expect(chunks.length).toBeGreaterThan(4);

					// Verify chunks arrived over time (some reads should take longer due to delays)
					const slowReads = timestamps.filter((time) => time > 50);
					expect(slowReads.length).toBeGreaterThan(4);
				}
			});
		}
	);
});

async function readBody(response: Response) {
	assert(response.body, "Response body is not readable");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	const timestamps: number[] = [];

	try {
		while (true) {
			const start = Date.now();
			const { done, value } = await reader.read();
			timestamps.push(Date.now() - start);
			if (done) break;
			chunks.push(decoder.decode(value, { stream: true }));
		}
	} finally {
		reader.releaseLock();
	}

	return { chunks, timestamps };
}
