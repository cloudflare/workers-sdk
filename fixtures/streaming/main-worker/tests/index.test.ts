import assert from "node:assert";
import { resolve } from "node:path";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../../shared/src/run-wrangler-long-lived";

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

	it.for([null, "gzip", "br", "identity"])(
		"preserves acceptable Worker encoding %s",
		async (encoding, { expect }) => {
			const compressionParam =
				encoding === null ? "" : `?compression=${encoding}`;
			const response = await fetch(
				`http://${ip}:${port}/streaming${compressionParam}`,
				{
					headers: { "accept-encoding": "br,gzip,deflate,zstd" },
				}
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toBe(
				encoding === "identity" ? null : encoding
			);
			expect(await response.text()).toContain("<div>END</div>");
		}
	);

	it.for(["gzip", "br", "identity"])(
		"decodes Worker encoding %s when the client only accepts identity",
		async (encoding, { expect }) => {
			const response = await fetch(
				`http://${ip}:${port}/streaming?compression=${encoding}`,
				{
					headers: { "accept-encoding": "identity" },
				}
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toBe(null);
			expect(await response.text()).toContain("<div>END</div>");
		}
	);

	it("delivers small chunks before the streaming response ends", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/streaming`, {
			headers: { "accept-encoding": "gzip, br" },
		});
		expect(response.headers.get("content-encoding")).toBe(null);
		assert(response.body);
		const reader = response.body.getReader();
		try {
			const first = await reader.read();
			expect(first.done).toBe(false);
			expect(new TextDecoder().decode(first.value)).not.toContain(
				"<div>END</div>"
			);
			let remaining = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				remaining += new TextDecoder().decode(value);
			}
			expect(remaining).toContain("<div>END</div>");
		} finally {
			reader.releaseLock();
		}
	});
});
