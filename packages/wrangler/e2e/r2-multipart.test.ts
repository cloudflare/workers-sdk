import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { truncate } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("remote R2 multipart", () => {
	it(
		"uploads and verifies an object larger than the REST upload limit",
		{ timeout: 180_000 },
		async ({ expect }) => {
			const helper = new WranglerE2ETestHelper();
			const bucket = await helper.r2(false);
			const objectPath = `${bucket}/multipart/object.bin`;
			await helper.seed({ "source.bin": "multipart" });
			const file = path.join(helper.tmpPath, "source.bin");
			const size = 301 * 1024 * 1024;
			await truncate(file, size);
			const expectedHash = createHash("sha256");
			for await (const chunk of createReadStream(file)) {
				expectedHash.update(chunk);
			}
			const sha256 = expectedHash.digest("hex");
			try {
				const output = await helper.run(
					`wrangler r2 object put ${objectPath} --remote --multipart --file source.bin --force`,
					{ timeout: 150_000 }
				);
				expect(output.stdout).toContain(
					`Upload complete. Verified ${size} bytes, SHA-256: ${sha256}`
				);
				await helper.run(
					`wrangler r2 object get ${objectPath} --remote --file readback.bin`
				);
				const readbackHash = createHash("sha256");
				let readbackSize = 0;
				for await (const chunk of createReadStream(
					path.join(helper.tmpPath, "readback.bin")
				)) {
					readbackSize += chunk.length;
					readbackHash.update(chunk);
				}
				expect(readbackSize).toBe(size);
				expect(readbackHash.digest("hex")).toBe(sha256);
			} finally {
				await helper.run(
					`wrangler r2 object delete ${objectPath} --remote --force`
				);
			}
		}
	);
});
