import * as fs from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import type { Config } from "@cloudflare/workers-utils";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import { usingLocalBucket } from "../../r2/helpers/object";

// Miniflare's use of undici doesn't play well with jest-mock-fetch
// and it is not needed here anyway.
vi.unmock("undici");

/**
 * Reads an object's `cacheExpiry` back out of the same local R2 state that
 * the `wrangler r2 ... put --local` commands persisted to, using Miniflare
 * directly, since the CLI has no command that prints `httpMetadata`. The
 * value must be extracted inside the closure: the `head()` result is a
 * proxy stub that is invalidated when `usingLocalBucket()` disposes its
 * Miniflare instance.
 */
async function headLocalObjectCacheExpiry(
	key: string,
	bucketName = "bucket-object-test"
) {
	return usingLocalBucket(
		undefined,
		// `wrangler r2 object put` with no config file persists to
		// `.wrangler/state` relative to the cwd, which is what an empty
		// config resolves to here too.
		{} as Config,
		bucketName,
		async (bucket) =>
			(await bucket.head(key))?.httpMetadata?.cacheExpiry?.toISOString()
	);
}

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

			it("should round trip local objects whose keys are not URL safe", async ({
				expect,
			}) => {
				const keys = [
					"my report.pdf",
					"report#1.pdf",
					"sale?50.pdf",
					"héllo.txt",
					"invoices/2026/q1.pdf",
					"50%off.pdf",
					"my%20report.pdf",
				];
				fs.writeFileSync("payload", "quarterly numbers");

				for (const key of keys) {
					await runWrangler(
						`r2 object put "bucket-object-test/${key}" --file ./payload`
					);
					await runWrangler(
						`r2 object get "bucket-object-test/${key}" --file ./downloaded`
					);

					expect(`${key} holds ${fs.readFileSync("downloaded", "utf8")}`).toBe(
						`${key} holds quarterly numbers`
					);
				}
				std.getAndClearOut();
			});

			it("should keep two local objects whose keys differ after a hash", async ({
				expect,
			}) => {
				fs.writeFileSync("first", "january");
				fs.writeFileSync("second", "february");

				await runWrangler(
					`r2 object put "bucket-object-test/archive#2026-01.zip" --file ./first`
				);
				await runWrangler(
					`r2 object put "bucket-object-test/archive#2026-02.zip" --file ./second`
				);
				std.getAndClearOut();

				await runWrangler(
					`r2 object get "bucket-object-test/archive#2026-01.zip" --file ./got-first`
				);
				await runWrangler(
					`r2 object get "bucket-object-test/archive#2026-02.zip" --file ./got-second`
				);
				std.getAndClearOut();

				expect(fs.readFileSync("got-first", "utf8")).toBe("january");
				expect(fs.readFileSync("got-second", "utf8")).toBe("february");
			});

			it("should bulk put a local object whose key is not URL safe", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "quarterly numbers");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([{ key: "my report #1.pdf", file: "payload" }])
				);

				await runWrangler(
					`r2 bulk put bucket-object-test --filename ./list.json`
				);
				await runWrangler(
					`r2 object get "bucket-object-test/my report #1.pdf" --file ./downloaded`
				);
				std.getAndClearOut();

				expect(fs.readFileSync("downloaded", "utf8")).toBe("quarterly numbers");
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

			it("should store an HTTP-date --expires value as the local object's cacheExpiry", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "cache me");

				await runWrangler(
					`r2 object put bucket-object-test/http-date --file ./payload --expires "Wed, 21 Oct 2026 07:28:00 GMT"`
				);

				expect(await headLocalObjectCacheExpiry("http-date")).toBe(
					"2026-10-21T07:28:00.000Z"
				);
			});

			it("should store an ISO date --expires value as the local object's cacheExpiry", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "cache me");

				await runWrangler(
					`r2 object put bucket-object-test/iso-date --file ./payload --expires 2026-10-21`
				);

				expect(await headLocalObjectCacheExpiry("iso-date")).toBe(
					"2026-10-21T00:00:00.000Z"
				);
			});

			it("should keep an all-digit --expires value as epoch milliseconds", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "cache me");

				await runWrangler(
					`r2 object put bucket-object-test/epoch-ms --file ./payload --expires 1792966000000`
				);

				expect(await headLocalObjectCacheExpiry("epoch-ms")).toBe(
					"2026-10-25T22:06:40.000Z"
				);
			});

			it("should store an ISO date --expires value as the cacheExpiry of local bulk put objects", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "cache me");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([{ key: "bulk-expires", file: "payload" }])
				);

				await runWrangler(
					`r2 bulk put bucket-object-test --filename ./list.json --expires 2026-10-21`
				);

				expect(await headLocalObjectCacheExpiry("bulk-expires")).toBe(
					"2026-10-21T00:00:00.000Z"
				);
			});
		});
	});
});
