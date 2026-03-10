import fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { beforeEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { MAX_UPLOAD_SIZE_BYTES } from "../../r2/constants";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw, mswR2handlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { createBigFile } from "./helper";

describe("r2", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswR2handlers));

	runInTempDir();

	describe("bulk", () => {
		it("should show help when the bulk command is passed", async () => {
			await runWrangler("r2 bulk");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2 bulk

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		describe("remote", () => {
			// Only login for remote tests, local tests shouldn't require auth
			mockAccountId();
			mockApiToken();

			it("should bulk upload R2 objects to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "cosmos");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{ key: "wormhole-img.png", file: "wormhole-img.png" },
						{ key: "nebula-img.png", file: "nebula-img.png" },
					])
				);

				await runWrangler(
					`r2 bulk put bulk-bucket --filename list.json --remote`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Starting bulk upload of 2 objects to bucket bulk-bucket using a concurrency of 20
					Uploaded 100% (2 out of 2)"
				`);
			});

			it("should bulk upload R2 with storage class to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "cosmos");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{ key: "wormhole-img.png", file: "wormhole-img.png" },
						{ key: "nebula-img.png", file: "nebula-img.png" },
					])
				);
				await runWrangler(
					`r2 bulk put bulk-bucket --filename list.json --remote -s InfrequentAccess`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Starting bulk upload of 2 objects to bucket bulk-bucket with InfrequentAccess storage class using a concurrency of 20
					Uploaded 100% (2 out of 2)"
				`);
			});

			it("should fail to bulk upload R2 objects if the list doesn't exist", async () => {
				await expect(
					runWrangler(
						`r2 bulk put bulk-bucket --filename no-list.json --remote`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The file "no-list.json" does not exist.]`
				);
			});

			it("should fail to bulk upload R2 objects if the list format is invalid", async () => {
				fs.writeFileSync("bad-list.json", "[ invalid json }");
				await expect(
					runWrangler(
						`r2 bulk put bulk-bucket --filename bad-list.json --remote`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The file "bad-list.json" is not a valid JSON.]`
				);
			});

			it("should fail to bulk upload R2 objects if the list contain invalid entries", async () => {
				fs.writeFileSync(
					"bad-list.json",
					JSON.stringify([{ key: 123, file: [] }])
				);
				await expect(
					runWrangler(
						`r2 bulk put bulk-bucket --filename bad-list.json --remote`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Each entry in the file "bad-list.json" must be an object with "key" and "file" string properties.]`
				);
			});

			it("should fail to bulk upload R2 objects if the list contain a non existent file", async () => {
				fs.writeFileSync(
					"bad-list.json",
					JSON.stringify([{ key: "key", file: "not/a/file" }])
				);
				await expect(
					runWrangler(
						`r2 bulk put bulk-bucket --filename bad-list.json --remote`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The file "not/a/file" does not exist.]`
				);
			});

			it(
				"should fail to bulk upload R2 objects if too large",
				// Writing a large file could timeout on CI
				{ timeout: 30_000 },
				async () => {
					const TOO_BIG_FILE_SIZE = MAX_UPLOAD_SIZE_BYTES + 1024 * 1024;
					await createBigFile("big-img.png", TOO_BIG_FILE_SIZE);
					fs.writeFileSync(
						"big-list.json",
						JSON.stringify([{ key: "too-big", file: "big-img.png" }])
					);
					await expect(
						runWrangler(
							`r2 bulk put bulk-bucket --filename big-list.json --remote`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: The file "big-img.png" exceeds the maximum upload size of 300 MiB.]`
					);
				}
			);

			it("should fail to bulk upload R2 objects if the name is invalid", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "cosmos");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{ key: "wormhole-img.png", file: "wormhole-img.png" },
						{ key: "nebula-img.png", file: "nebula-img.png" },
					])
				);

				await expect(
					runWrangler(`r2 bulk put BUCKET --filename list.json --remote`)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "BUCKET" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
				);
			});

			it("should pass all fetch option flags into requestInit & check request inputs", async () => {
				msw.use(
					http.put(
						"*/accounts/:accountId/r2/buckets/bulk-bucket/objects/:objectName",
						({ request, params }) => {
							const { accountId } = params;
							expect(accountId).toEqual("some-account-id");
							const headersObject = Object.fromEntries(
								request.headers.entries()
							);
							delete headersObject["user-agent"];
							//This is removed because jest-fetch-mock does not support ReadableStream request bodies and has an incorrect body and content-length
							delete headersObject["content-length"];
							expect(headersObject).toMatchInlineSnapshot(`
								{
								  "authorization": "Bearer some-api-token",
								  "cache-control": "cache-control-mock",
								  "content-disposition": "content-disposition-mock",
								  "content-encoding": "content-encoding-mock",
								  "content-language": "content-lang-mock",
								  "content-type": "content-type-mock",
								  "expires": "expire-time-mock",
								}
							`);
							return HttpResponse.json(
								createFetchResult({
									accountId: "some-account-id",
									bucketName: "bucket-object-test",
									objectName: "wormhole-img.png",
								})
							);
						},
						{ once: false }
					)
				);
				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "cosmos");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{ key: "wormhole-img.png", file: "wormhole-img.png" },
						{ key: "nebula-img.png", file: "nebula-img.png" },
					])
				);
				const flags =
					"--ct content-type-mock --cd content-disposition-mock --ce content-encoding-mock --cl content-lang-mock --cc cache-control-mock --expires expire-time-mock";

				await runWrangler(
					`r2 bulk put bulk-bucket --remote --filename list.json ${flags}`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Starting bulk upload of 2 objects to bucket bulk-bucket using a concurrency of 20
					Uploaded 100% (2 out of 2)"
				`);
			});

			it("should allow --env and --expires to be used together without conflict", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				fs.writeFileSync("nebula-img.png", "cosmos");
				fs.writeFileSync(
					"list.json",
					JSON.stringify([
						{ key: "wormhole-img.png", file: "wormhole-img.png" },
						{ key: "nebula-img.png", file: "nebula-img.png" },
					])
				);
				writeWranglerConfig({
					env: {
						production: {},
					},
				});
				await runWrangler(
					`r2 bulk put bulk-bucket --remote --filename list.json --env production --expires 2024-12-31`
				);

				expect(std.out).toContain("Uploaded 100%");
			});
		});
	});
});
