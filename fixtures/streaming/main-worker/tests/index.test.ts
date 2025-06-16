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
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	describe.concurrent.each([
		{ encoding: null },
		{ encoding: "gzip" },
		{ encoding: "br" },
		{ encoding: "identity" },
	])("worker encoding set to $encoding", ({ encoding }) => {
		it("uses the content-encoding provided by the Worker, if acceptable", async ({
			expect,
		}) => {
			const compressionParam =
				encoding === null ? "" : `?compression=${encoding}`;
			const response = await fetch(
				`http://${ip}:${port}/streaming${compressionParam}`,
				{ headers: { "accept-encoding": "br,gzip,deflate,zstd" } }
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toEqual(
				encoding === "identity" ? null : encoding
			);
		});

		it("uses identity encoding if only identity is acceptable", async ({
			expect,
		}) => {
			const compressionParam =
				encoding === null ? "" : `?compression=${encoding}`;
			const response = await fetch(
				`http://${ip}:${port}/streaming${compressionParam}`,
				{ headers: { "accept-encoding": "" } }
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toEqual(null);
		});

		it("sends the content in small chunks if identity encoded", async ({
			expect,
		}) => {
			const response = await fetch(`http://${ip}:${port}/streaming`, {
				headers: { "accept-encoding": encoding },
			});
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toBe(null);

			const { chunks, timestamps } = await readBody(response);

			const fullContent = chunks.join("");

			// Verify we received the expected content structure
			expect(fullContent).toContain("<div>START</div>");
			expect(fullContent).toContain("<div>test 0");
			expect(fullContent).toContain("<div>test 4");
			expect(fullContent).toContain("<div>END</div>");

			// The gzip and brotli responses do not fill the streaming buffer so they are sent in a single chunk.
			if (encoding !== "gzip" && encoding !== "br") {
				// Verify we received multiple a chunk for each delayed piece of content.
				expect(chunks.length).toBeGreaterThan(4);

				// Verify chunks arrived over time (some reads should take longer due to delays)
				const slowReads = timestamps.filter((time) => time > 50);
				expect(slowReads.length).toBeGreaterThan(4);
			}
		});
	});
});

async function readBody(response: Response) {
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
