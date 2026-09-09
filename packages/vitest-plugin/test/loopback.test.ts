import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { Request } from "miniflare";
import { afterEach, beforeEach, describe, it } from "vitest";
import { createLoopbackHandler } from "../src/pool/loopback";
import type { Miniflare } from "miniflare";

describe("coverage loopback", () => {
	let tmpPath: string;

	beforeEach(async () => {
		tmpPath = await fs.mkdtemp(path.join(os.tmpdir(), "vitest-loopback-"));
	});

	afterEach(async () => {
		await removeDir(tmpPath);
	});

	it("writes only to the host-configured coverage directory", async ({
		expect,
	}) => {
		const coverageDirectory = path.join(tmpPath, "coverage");
		const untrustedDirectory = path.join(tmpPath, "untrusted");
		await fs.mkdir(coverageDirectory);
		const handleLoopbackRequest = createLoopbackHandler(coverageDirectory);
		const coverage = JSON.stringify({ covered: true });
		const response = await handleLoopbackRequest(
			new Request(
				`http://placeholder/coverage?directory=${encodeURIComponent(untrustedDirectory)}`,
				{ method: "POST", body: coverage }
			),
			{} as Miniflare
		);

		expect(response.status).toBe(200);
		const filePath = await response.text();
		expect(path.dirname(filePath)).toBe(coverageDirectory);
		expect(await fs.readFile(filePath, "utf8")).toBe(coverage);
		await expect(fs.stat(untrustedDirectory)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
