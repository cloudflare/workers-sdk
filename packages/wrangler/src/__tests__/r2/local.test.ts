import * as fs from "node:fs";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

// Miniflare's use of undici doesn't play well with jest-mock-fetch
// and it is not needed here anyway.
vi.unmock("undici");

describe("r2", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	describe("r2 object", () => {
		describe("local", () => {
			it("should put R2 object to a local bucket", async ({ expect }) => {
				await expect(() =>
					runWrangler(
						`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "wormhole-img.png" from "bucket-object-test".
					"
				`);

				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Creating object "wormhole-img.png" in bucket "bucket-object-test".
					Upload complete."
				`);

				await runWrangler(
					`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "wormhole-img.png" from "bucket-object-test".
					Download complete."
				`);
			});

			it("should bulk put R2 objects to a local bucket", async ({ expect }) => {
				await expect(() =>
					runWrangler(
						`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "wormhole-img.png" from "bucket-object-test".
					"
				`);

				await expect(() =>
					runWrangler(
						`r2 object get bucket-object-test/nebula-img.png --file ./nebula-img.png`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "nebula-img.png" from "bucket-object-test".
					"
				`);

				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "nebula");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{
							key: "wormhole-img.png",
							file: "wormhole-img.png",
						},
						{
							key: "nebula-img.png",
							file: "nebula-img.png",
						},
					])
				);
				await runWrangler(
					`r2 bulk put bucket-object-test --filename ./list.json`
				);
				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Starting bulk upload of 2 objects to bucket bucket-object-test using a concurrency of 20
					Uploaded 100% (2 out of 2)"
				`);

				await runWrangler(
					`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "wormhole-img.png" from "bucket-object-test".
					Download complete."
				`);

				await runWrangler(
					`r2 object get bucket-object-test/nebula-img.png --file ./nebula-img.png `
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "nebula-img.png" from "bucket-object-test".
					Download complete."
				`);
			});

			it("should delete R2 object from local bucket", async ({ expect }) => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.warn).toMatchInlineSnapshot(`""`);
				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Creating object "wormhole-img.png" in bucket "bucket-object-test".
					Upload complete."
				`);

				await runWrangler(
					`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
				);
				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "wormhole-img.png" from "bucket-object-test".
					Download complete."
				`);

				await runWrangler(
					`r2 object delete bucket-object-test/wormhole-img.png `
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Deleting object "wormhole-img.png" from bucket "bucket-object-test".
					Delete complete."
				`);

				await expect(() =>
					runWrangler(
						`r2 object get bucket-object-test/wormhole-img.png --file ./wormhole-img.png `
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);
			});

			it("should follow persist-to for object bucket", async ({ expect }) => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucket-object-test/file-one --file ./wormhole-img.png `
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Creating object "file-one" in bucket "bucket-object-test".
					Upload complete."
				`);

				await runWrangler(
					`r2 object put bucket-object-test/file-two --file ./wormhole-img.png  --persist-to ./different-dir`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Creating object "file-two" in bucket "bucket-object-test".
					Upload complete."
				`);

				await expect(() =>
					runWrangler(
						`r2 object get bucket-object-test/file-one --file ./wormhole-img.png  --persist-to ./different-dir`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The specified key does not exist.]`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "file-one" from "bucket-object-test".
					"
				`);

				await runWrangler(
					`r2 object get bucket-object-test/file-two --file ./wormhole-img.png  --persist-to ./different-dir`
				);

				expect(std.getAndClearOut()).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: local

					Use --remote if you want to access the remote instance.

					Downloading "file-two" from "bucket-object-test".
					Download complete."
				`);
			});
		});
	});
});
