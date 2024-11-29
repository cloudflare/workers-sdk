import * as fs from "node:fs";
import { vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// Miniflare's use of undici doesn't play well with jest-mock-fetch
// and it is not needed here anyway.
vi.unmock("undici");

describe("r2", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	describe("r2 object", () => {
		describe("local", () => {
			it("should put R2 object from local bucket", async () => {
				await expect(() =>
					runWrangler(
						`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.out).toMatchInlineSnapshot(`
			"Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".

			Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete."
		`);

				await runWrangler(
					`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.out).toMatchInlineSnapshot(`
			"Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".

			Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete.
			Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".
			Download complete."
		`);
			});

			it("should delete R2 object from local bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
				);

				await runWrangler(
					`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete.
			Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".
			Download complete."
		`);

				await runWrangler(
					`r2 object delete bucketName-object-test/wormhole-img.png `
				);
				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete.
			Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".
			Download complete.
			Deleting object \\"wormhole-img.png\\" from bucket \\"bucketName-object-test\\".
			Delete complete."
		`);

				await expect(() =>
					runWrangler(
						`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png `
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);
			});

			it("should follow persist-to for object bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/file-one --file ./wormhole-img.png `
				);

				await runWrangler(
					`r2 object put bucketName-object-test/file-two --file ./wormhole-img.png  --persist-to ./different-dir`
				);

				await expect(() =>
					runWrangler(
						`r2 object get bucketName-object-test/file-one --file ./wormhole-img.png  --persist-to ./different-dir`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				await runWrangler(
					`r2 object get bucketName-object-test/file-two --file ./wormhole-img.png  --persist-to ./different-dir`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"file-one\\" in bucket \\"bucketName-object-test\\".
			Upload complete.
			Creating object \\"file-two\\" in bucket \\"bucketName-object-test\\".
			Upload complete.
			Downloading \\"file-one\\" from \\"bucketName-object-test\\".

			Downloading \\"file-two\\" from \\"bucketName-object-test\\".
			Download complete."
		`);
			});
		});
	});
});
