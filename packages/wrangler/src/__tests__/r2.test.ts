import * as fs from "node:fs";
import { rest } from "msw";
import prettyBytes from "pretty-bytes";
import { MAX_UPLOAD_SIZE } from "../r2/constants";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw, mswSuccessR2handlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { R2BucketInfo } from "../r2/helpers";

describe("r2", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswSuccessR2handlers));

	runInTempDir();

	describe("bucket", () => {
		mockAccountId();
		mockApiToken();

		it("should show the correct help when an invalid command is passed", async () => {
			await expect(() =>
				runWrangler("r2 bucket foo")
			).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown argument: foo"`);
			expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

			          "
		        `);
			expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket

			Manage R2 buckets

			Commands:
			  wrangler r2 bucket create <name>  Create a new R2 bucket
			  wrangler r2 bucket list           List R2 buckets
			  wrangler r2 bucket delete <name>  Delete an R2 bucket
			  wrangler r2 bucket sippy          Manage Sippy incremental migration on an R2 bucket

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]"
		`);
		});

		describe("list", () => {
			it("should list buckets & check request inputs", async () => {
				const expectedBuckets: R2BucketInfo[] = [
					{ name: "bucket-1-local-once", creation_date: "01-01-2001" },
					{ name: "bucket-2-local-once", creation_date: "01-01-2001" },
				];
				msw.use(
					rest.get(
						"*/accounts/:accountId/r2/buckets",
						async (request, response, context) => {
							const { accountId } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.text()).toEqual("");
							return response.once(
								context.json(
									createFetchResult({
										buckets: [
											{
												name: "bucket-1-local-once",
												creation_date: "01-01-2001",
											},
											{
												name: "bucket-2-local-once",
												creation_date: "01-01-2001",
											},
										],
									})
								)
							);
						}
					)
				);
				await runWrangler("r2 bucket list");

				expect(std.err).toMatchInlineSnapshot(`""`);
				const buckets = JSON.parse(std.out);
				expect(buckets).toEqual(expectedBuckets);
			});
		});

		describe("create", () => {
			it("should error if no bucket name is given", async () => {
				await expect(
					runWrangler("r2 bucket create")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Not enough non-option arguments: got 0, need at least 1"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket create <name>

			Create a new R2 bucket

			Positionals:
			  name  The name of the new bucket  [string] [required]

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Options:
			  -J, --jurisdiction  The jurisdiction where the new bucket will be created  [string]"
		`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				            "
			          `);
			});

			it("should error if the bucket to create contains spaces", async () => {
				await expect(
					runWrangler("r2 bucket create abc def ghi")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Unknown arguments: def, ghi"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket create <name>

			Create a new R2 bucket

			Positionals:
			  name  The name of the new bucket  [string] [required]

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Options:
			  -J, --jurisdiction  The jurisdiction where the new bucket will be created  [string]"
		`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
			});

			it("should create a bucket & check request inputs", async () => {
				msw.use(
					rest.post(
						"*/accounts/:accountId/r2/buckets",
						async (request, response, context) => {
							const { accountId } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.json()).toEqual({ name: "testBucket" });
							return response.once(context.json(createFetchResult({})));
						}
					)
				);
				await runWrangler("r2 bucket create testBucket");
				expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket.
				            Created bucket testBucket."
			          `);
			});

			it("should create a bucket with the expected jurisdiction", async () => {
				msw.use(
					rest.post(
						"*/accounts/:accountId/r2/buckets",
						async (request, response, context) => {
							const { accountId } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(request.headers.get("cf-r2-jurisdiction")).toEqual("eu");
							expect(await request.json()).toEqual({ name: "testBucket" });
							return response.once(context.json(createFetchResult({})));
						}
					)
				);
				await runWrangler("r2 bucket create testBucket -J eu");
				expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket (eu).
				            Created bucket testBucket (eu)."
			          `);
			});
		});

		describe("delete", () => {
			it("should error if no bucket name is given", async () => {
				await expect(
					runWrangler("r2 bucket delete")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Not enough non-option arguments: got 0, need at least 1"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket delete <name>

			Delete an R2 bucket

			Positionals:
			  name  The name of the bucket to delete  [string] [required]

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Options:
			  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
		`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				            "
			          `);
			});

			it("should error if the bucket name to delete contains spaces", async () => {
				await expect(
					runWrangler("r2 bucket delete abc def ghi")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Unknown arguments: def, ghi"`
				);
				expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket delete <name>

			Delete an R2 bucket

			Positionals:
			  name  The name of the bucket to delete  [string] [required]

			Global Flags:
			  -j, --experimental-json-config  ⚑Experimental: support wrangler.json  [boolean]
			  -c, --config                    ⚑Path to .toml configuration file  [string]
			  -e, --env                       ⚑Environment to use for operations and .env files  [string]
			  -h, --help                      ⚑Show help  [boolean]
			  -v, --version                   ⚑Show version number  [boolean]

			Options:
			  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
		`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
			});

			it("should delete a bucket specified by name & check requests inputs", async () => {
				msw.use(
					rest.delete(
						"*/accounts/:accountId/r2/buckets/:bucketName",
						async (request, response, context) => {
							const { accountId, bucketName } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketName).toEqual("some-bucket");
							expect(await request.text()).toEqual("");
							expect(request.headers.get("authorization")).toEqual(
								"Bearer some-api-token"
							);

							return response.once(context.json(createFetchResult(null)));
						}
					)
				);
				await runWrangler(`r2 bucket delete some-bucket`);
				expect(std.out).toMatchInlineSnapshot(`
				"Deleting bucket some-bucket.
				Deleted bucket some-bucket."
			`);
			});
		});

		describe("sippy", () => {
			const { setIsTTY } = useMockIsTTY();

			it("should show the correct help when an invalid command is passed", async () => {
				await expect(() =>
					runWrangler("r2 bucket sippy foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown argument: foo"`);
				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

			"
		`);
				expect(std.out).toMatchInlineSnapshot(`
			"
			wrangler r2 bucket sippy

			Manage Sippy incremental migration on an R2 bucket

			Commands:
			  wrangler r2 bucket sippy enable <name>   Enable Sippy on an R2 bucket
			  wrangler r2 bucket sippy disable <name>  Disable Sippy on an R2 bucket
			  wrangler r2 bucket sippy get <name>      Check the status of Sippy on an R2 bucket

			Flags:
			  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
			  -c, --config                    Path to .toml configuration file  [string]
			  -e, --env                       Environment to use for operations and .env files  [string]
			  -h, --help                      Show help  [boolean]
			  -v, --version                   Show version number  [boolean]"
		`);
			});

			describe("enable", () => {
				it("should enable sippy on AWS for the given bucket", async () => {
					setIsTTY(false);

					msw.use(
						rest.put(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async (request, response, context) => {
								expect(await request.json()).toEqual({
									source: {
										provider: "aws",
										region: "awsRegion",
										bucket: "awsBucket",
										accessKeyId: "aws-key",
										secretAccessKey: "aws-secret",
									},
									destination: {
										provider: "r2",
										accessKeyId: "some-key",
										secretAccessKey: "some-secret",
									},
								});
								return response.once(context.json(createFetchResult({})));
							}
						)
					);
					await runWrangler(
						"r2 bucket sippy enable testBucket --r2-access-key-id=some-key --r2-secret-access-key=some-secret --provider=AWS --access-key-id=aws-key --secret-access-key=aws-secret --region=awsRegion --bucket=awsBucket"
					);
					expect(std.out).toMatchInlineSnapshot(
						`"✨ Successfully enabled Sippy on the 'testBucket' bucket."`
					);
				});

				it("should enable sippy on GCS for the given bucket", async () => {
					setIsTTY(false);

					msw.use(
						rest.put(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async (request, response, context) => {
								expect(await request.json()).toEqual({
									source: {
										provider: "gcs",
										bucket: "gcsBucket",
										clientEmail: "gcs-client-email",
										privateKey: "gcs-private-key",
									},
									destination: {
										provider: "r2",
										accessKeyId: "some-key",
										secretAccessKey: "some-secret",
									},
								});
								return response.once(context.json(createFetchResult({})));
							}
						)
					);
					await runWrangler(
						"r2 bucket sippy enable testBucket --r2-access-key-id=some-key --r2-secret-access-key=some-secret --provider=GCS --client-email=gcs-client-email --private-key=gcs-private-key --bucket=gcsBucket"
					);
					expect(std.out).toMatchInlineSnapshot(
						`"✨ Successfully enabled Sippy on the 'testBucket' bucket."`
					);
				});

				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket sippy enable")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"Not enough non-option arguments: got 0, need at least 1"`
					);
					expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 bucket sippy enable <name>

				Enable Sippy on an R2 bucket

				Positionals:
				  name  The name of the bucket  [string] [required]

				Flags:
				  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

				Options:
				  -J, --jurisdiction              The jurisdiction where the bucket exists  [string]
				      --provider  [choices: \\"AWS\\", \\"GCS\\"]
				      --bucket                    The name of the upstream bucket  [string]
				      --region                    (AWS provider only) The region of the upstream bucket  [string]
				      --access-key-id             (AWS provider only) The secret access key id for the upstream bucket  [string]
				      --secret-access-key         (AWS provider only) The secret access key for the upstream bucket  [string]
				      --service-account-key-file  (GCS provider only) The path to your Google Cloud service account key JSON file  [string]
				      --client-email              (GCS provider only) The client email for your Google Cloud service account key  [string]
				      --private-key               (GCS provider only) The private key for your Google Cloud service account key  [string]
				      --r2-access-key-id          The secret access key id for this R2 bucket  [string]
				      --r2-secret-access-key      The secret access key for this R2 bucket  [string]"
			`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});
			});

			describe("disable", () => {
				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket sippy disable")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"Not enough non-option arguments: got 0, need at least 1"`
					);
					expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 bucket sippy disable <name>

				Disable Sippy on an R2 bucket

				Positionals:
				  name  The name of the bucket  [string] [required]

				Flags:
				  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

				Options:
				  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
			`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});

				it("should disable Sippy for the given bucket", async () => {
					setIsTTY(false);

					msw.use(
						rest.delete(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async (request, response, context) => {
								return response.once(context.json(createFetchResult({})));
							}
						)
					);
					await runWrangler("r2 bucket sippy disable testBucket");
					expect(std.out).toMatchInlineSnapshot(
						`"✨ Successfully disabled Sippy on the 'testBucket' bucket."`
					);
				});
			});

			describe("get", () => {
				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket sippy get")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`"Not enough non-option arguments: got 0, need at least 1"`
					);
					expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 bucket sippy get <name>

				Check the status of Sippy on an R2 bucket

				Positionals:
				  name  The name of the bucket  [string] [required]

				Flags:
				  -j, --experimental-json-config  Experimental: Support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]

				Options:
				  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
			`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});
			});

			it("should get the status of Sippy for the given bucket", async () => {
				setIsTTY(false);

				msw.use(
					rest.get(
						"*/accounts/:accountId/r2/buckets/:bucketName/sippy",
						async (request, response, context) => {
							const { accountId } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.text()).toEqual("");
							return response.once(
								context.json(
									createFetchResult(
										"https://storage.googleapis.com/storage/v1/b/testBucket"
									)
								)
							);
						}
					)
				);
				await runWrangler("r2 bucket sippy get testBucket");
				expect(std.out).toMatchInlineSnapshot(
					`"Sippy configuration: https://storage.googleapis.com/storage/v1/b/testBucket"`
				);
			});
		});
	});

	describe("r2 object", () => {
		describe("remote", () => {
			// Only login for remote tests, local tests shouldn't require auth
			mockAccountId();
			mockApiToken();

			it("should download R2 object from bucket", async () => {
				await runWrangler(
					`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".
			Download complete."
		`);
			});

			it("should download R2 object from bucket into directory", async () => {
				await runWrangler(
					`r2 object get bucketName-object-test/wormhole-img.png --file ./a/b/c/wormhole-img.png`
				);
				expect(fs.readFileSync("a/b/c/wormhole-img.png", "utf8")).toBe(
					"wormhole-img.png"
				);
			});

			it("should upload R2 object to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete."
		`);
			});

			it("should fail to upload R2 object to bucket if too large", async () => {
				const TOO_BIG_FILE_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024;
				fs.writeFileSync("wormhole-img.png", Buffer.alloc(TOO_BIG_FILE_SIZE));
				await expect(
					runWrangler(
						`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(`
				"Error: Wrangler only supports uploading files up to ${prettyBytes(
					MAX_UPLOAD_SIZE,
					{ binary: true }
				)} in size
				wormhole-img.png is ${prettyBytes(TOO_BIG_FILE_SIZE, { binary: true })} in size"
			`);
			});

			it("should pass all fetch option flags into requestInit & check request inputs", async () => {
				msw.use(
					rest.put(
						"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
						(request, response, context) => {
							const { accountId, bucketName, objectName } = request.params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketName).toEqual("bucketName-object-test");
							expect(objectName).toEqual("wormhole-img.png");
							const headersObject = request.headers.all();
							delete headersObject["user-agent"];
							//This is removed because jest-fetch-mock does not support ReadableStream request bodies and has an incorrect body and content-length
							delete headersObject["content-length"];
							expect(headersObject).toMatchInlineSnapshot(`
					Object {
					  "accept": "*/*",
					  "accept-encoding": "gzip,deflate",
					  "authorization": "Bearer some-api-token",
					  "cache-control": "cache-control-mock",
					  "connection": "close",
					  "content-disposition": "content-disposition-mock",
					  "content-encoding": "content-encoding-mock",
					  "content-language": "content-lang-mock",
					  "content-type": "content-type-mock",
					  "expires": "expire-time-mock",
					  "host": "api.cloudflare.com",
					}
				`);
							return response.once(
								context.json(
									createFetchResult({
										accountId: "some-account-id",
										bucketName: "bucketName-object-test",
										objectName: "wormhole-img.png",
									})
								)
							);
						}
					)
				);
				fs.writeFileSync("wormhole-img.png", "passageway");
				const flags =
					"--ct content-type-mock --cd content-disposition-mock --ce content-encoding-mock --cl content-lang-mock --cc cache-control-mock --e expire-time-mock";

				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png ${flags} --file wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete."
		`);
			});

			it("should delete R2 object from bucket", async () => {
				await runWrangler(
					`r2 object delete bucketName-object-test/wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Deleting object \\"wormhole-img.png\\" from bucket \\"bucketName-object-test\\".
			Delete complete."
		`);
			});

			it("should not allow `--pipe` & `--file` to run together", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await expect(
					runWrangler(
						`r2 object put bucketName-object-test/wormhole-img.png --pipe --file wormhole-img.png`
					)
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`"Arguments pipe and file are mutually exclusive"`
				);

				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments pipe and file are mutually exclusive[0m

			"
		`);
			});
		});
	});
});
