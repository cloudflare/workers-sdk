import * as fs from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";

// Miniflare's use of undici doesn't play well with jest-mock-fetch
// and it is not needed here anyway.
vi.unmock("undici");

const BUCKET = "bucket-object-test";
const PERSIST_TO = "./state";

describe("r2", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	describe("r2 object", () => {
		describe("local", () => {
			// Reads back the `cacheExpiry` of a locally persisted object by
			// opening the same local state that `r2 object put --local` wrote.
			// The value must be read before the Miniflare instance is disposed,
			// as objects returned through the magic proxy cannot be used after.
			async function getCacheExpiry(key: string) {
				const mf = new Miniflare(
					convertV4MiniflareOptions({
						modules: true,
						script: "export default {};",
						resourcePersistencePath: path.resolve(PERSIST_TO, "v3"),
						r2Buckets: { BUCKET },
					})
				);
				try {
					const bucket = await mf.getR2Bucket("BUCKET");
					const head = await bucket.head(key);
					return head?.httpMetadata?.cacheExpiry ?? null;
				} finally {
					await mf.dispose();
				}
			}

			it("should accept an HTTP-date --expires for r2 object put", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "hello");
				await runWrangler(
					`r2 object put ${BUCKET}/http-date --file ./payload --persist-to ${PERSIST_TO} --expires "Wed, 21 Oct 2026 07:28:00 GMT"`
				);

				expect(await getCacheExpiry("http-date")).toEqual(
					new Date("2026-10-21T07:28:00.000Z")
				);
			});

			it("should store an ISO-date --expires for r2 object put as the intended instant", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "hello");
				await runWrangler(
					`r2 object put ${BUCKET}/iso-date --file ./payload --persist-to ${PERSIST_TO} --expires 2026-10-21`
				);

				expect(await getCacheExpiry("iso-date")).toEqual(
					new Date("2026-10-21T00:00:00.000Z")
				);
			});

			it("should keep treating an all-digit --expires as epoch milliseconds", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "hello");
				await runWrangler(
					`r2 object put ${BUCKET}/epoch-ms --file ./payload --persist-to ${PERSIST_TO} --expires 1792966000000`
				);

				expect(await getCacheExpiry("epoch-ms")).toEqual(
					new Date(1792966000000)
				);
			});

			it("should accept an HTTP-date --expires for r2 bulk put", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "hello");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([{ key: "bulk-http-date", file: "payload" }])
				);
				await runWrangler(
					`r2 bulk put ${BUCKET} --filename ./list.json --persist-to ${PERSIST_TO} --expires "Wed, 21 Oct 2026 07:28:00 GMT"`
				);

				expect(await getCacheExpiry("bulk-http-date")).toEqual(
					new Date("2026-10-21T07:28:00.000Z")
				);
			});

			it("should store an ISO-date --expires for r2 bulk put as the intended instant", async ({
				expect,
			}) => {
				fs.writeFileSync("payload", "hello");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([{ key: "bulk-iso-date", file: "payload" }])
				);
				await runWrangler(
					`r2 bulk put ${BUCKET} --filename ./list.json --persist-to ${PERSIST_TO} --expires 2026-10-21`
				);

				expect(await getCacheExpiry("bulk-iso-date")).toEqual(
					new Date("2026-10-21T00:00:00.000Z")
				);
			});
		});
	});
});
