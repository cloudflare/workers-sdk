import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("Worker", () => {
	let worker: UnstableDevWorker;
	let remote: UnstableDevWorker;
	let tmpDir: string;

	beforeAll(async () => {
		worker = await unstable_dev("src/index.ts", {
			experimental: { disableExperimentalWarning: true },
		});

		const tmpDir = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "preview-tests"))
		);

		await fs.writeFile(
			path.join(tmpDir, "echo-remote.js"),
			/*javascript*/ `
				export default {
					fetch(request) {
						return Response.json({
							url: request.url,
							headers: [...request.headers.entries()]
						})
					}
				}
			`.trim()
		);

		remote = await unstable_dev("src/index.ts", {
			experimental: { disableExperimentalWarning: true },
			port: 6756,
		});
	});

	afterAll(async () => {
		await worker.stop();
		await remote.stop();

		try {
			await fs.rm(tmpDir, { recursive: true });
		} catch {}
	});

	it("should return Hello World", async () => {
		const resp = await worker.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=${encodeURIComponent(
				"http://localhost:6756"
			)}`,
			{
				method: "POST",
			}
		);
		if (resp.ok) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(
				'"{\\"error\\":\\"Error\\",\\"message\\":\\"No exchange_url provided\\"}"'
			);
		}
	});
});
