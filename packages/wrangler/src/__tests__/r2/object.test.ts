import * as fs from "node:fs";
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

	describe("object", () => {
		it("should show help when the object command is passed", async () => {
			await runWrangler("r2 object");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2 object

				Manage R2 objects

				COMMANDS
				  wrangler r2 object get <objectPath>     Fetch an object from an R2 bucket
				  wrangler r2 object put <objectPath>     Create an object in an R2 bucket
				  wrangler r2 object delete <objectPath>  Delete an object in an R2 bucket

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

			it("should download R2 object from bucket", async () => {
				await runWrangler(
					`r2 object get --remote bucket-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Downloading "wormhole-img.png" from "bucket-object-test".
					Download complete."
				`);
			});

			it("should download R2 object from bucket into directory", async () => {
				await runWrangler(
					`r2 object get --remote bucket-object-test/wormhole-img.png --file ./a/b/c/wormhole-img.png`
				);
				expect(fs.readFileSync("a/b/c/wormhole-img.png", "utf8")).toBe(
					"wormhole-img.png"
				);
			});

			it("should upload R2 object to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put --remote bucket-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Creating object "wormhole-img.png" in bucket "bucket-object-test".
					Upload complete."
				`);
			});

			it("should upload R2 object with storage class to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put --remote bucket-object-test/wormhole-img.png --file ./wormhole-img.png -s InfrequentAccess`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Creating object "wormhole-img.png" with InfrequentAccess storage class in bucket "bucket-object-test".
					Upload complete."
				`);
			});

			it(
				"should fail to upload R2 object to bucket if too large",
				// Writing a large file could timeout on CI
				{ timeout: 30_000 },
				async () => {
					const TOO_BIG_FILE_SIZE = MAX_UPLOAD_SIZE_BYTES + 1024 * 1024;
					await createBigFile("wormhole-img.png", TOO_BIG_FILE_SIZE);
					await expect(
						runWrangler(
							`r2 object put --remote bucket-object-test/wormhole-img.png --file ./wormhole-img.png`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(`
					[Error: Error: Wrangler only supports uploading files up to 300 MiB in size
					wormhole-img.png is 301 MiB in size]
				`);
				}
			);

			it("should fail to upload R2 object to bucket if the name is invalid", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await expect(
					runWrangler(
						`r2 object put --remote BUCKET/wormhole-img.png --file ./wormhole-img.png`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "BUCKET" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
				);
			});

			it("should pass all fetch option flags into requestInit & check request inputs", async () => {
				msw.use(
					http.put(
						"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
						({ request, params }) => {
							const { accountId, bucketName, objectName } = params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketName).toEqual("bucket-object-test");
							expect(objectName).toEqual("wormhole-img.png");
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
						{ once: true }
					)
				);
				fs.writeFileSync("wormhole-img.png", "passageway");
				const flags =
					"--ct content-type-mock --cd content-disposition-mock --ce content-encoding-mock --cl content-lang-mock --cc cache-control-mock --expires expire-time-mock";

				await runWrangler(
					`r2 object put --remote bucket-object-test/wormhole-img.png ${flags} --file wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Creating object "wormhole-img.png" in bucket "bucket-object-test".
					Upload complete."
				`);
			});

			it("should delete R2 object from bucket", async () => {
				await runWrangler(
					`r2 object delete --remote bucket-object-test/wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Resource location: remote

					Deleting object "wormhole-img.png" from bucket "bucket-object-test".
					Delete complete."
				`);
			});

			it("should not allow `--pipe` & `--file` to run together", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await expect(
					runWrangler(
						`r2 object put --remote bucket-object-test/wormhole-img.png --pipe --file wormhole-img.png`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Arguments pipe and file are mutually exclusive]`
				);

				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments pipe and file are mutually exclusive[0m

			"
		`);
			});

			it("should allow --env and --expires to be used together without conflict", async () => {
				writeWranglerConfig({
					env: {
						production: {},
					},
				});
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put --remote bucket-object-test/wormhole-img.png --file ./wormhole-img.png --env production --expires 2024-12-31`
				);

				expect(std.out).toContain("Upload complete");
			});
		});
	});
});
