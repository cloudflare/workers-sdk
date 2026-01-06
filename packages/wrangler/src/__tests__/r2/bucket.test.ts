import * as fs from "node:fs";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { actionsForEventCategories } from "../../r2/helpers/notification";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw, mswR2handlers } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { BucketLockRule } from "../../r2/helpers/bucket";
import type {
	PutNotificationRequestBody,
	R2EventableOperation,
	R2EventType,
} from "../../r2/helpers/notification";

function mockBucketLockPutNew(bucketName: string, rules: BucketLockRule[]) {
	mockBucketLockPutWithExistingRules(bucketName, [], rules);
}

function mockBucketLockPutWithExistingRules(
	bucketName: string,
	existingRules: BucketLockRule[],
	newRules: BucketLockRule[]
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/r2/buckets/:bucketName/lock",
			async ({ params }) => {
				const { accountId, bucketName: bucketParam } = params;
				expect(accountId).toEqual("some-account-id");
				expect(bucketParam).toEqual(bucketName);
				return HttpResponse.json(
					createFetchResult({
						rules: existingRules,
					})
				);
			},
			{ once: true }
		),
		http.put(
			"*/accounts/:accountId/r2/buckets/:bucketName/lock",
			async ({ request, params }) => {
				const { accountId, bucketName: bucketParam } = params;
				expect(accountId).toEqual("some-account-id");
				expect(bucketName).toEqual(bucketParam);
				const requestBody = await request.json();
				expect(requestBody).toEqual({
					rules: newRules,
				});
				return HttpResponse.json(createFetchResult({}));
			},
			{ once: true }
		)
	);
}

function mockBucketLockGetExistingRules(
	bucketName: string,
	existingRules: BucketLockRule[]
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/r2/buckets/:bucketName/lock",
			async ({ params }) => {
				const { accountId, bucketName: bucketParam } = params;
				expect(accountId).toEqual("some-account-id");
				expect(bucketParam).toEqual(bucketName);
				return HttpResponse.json(
					createFetchResult({
						rules: existingRules,
					})
				);
			},
			{ once: true }
		)
	);
}

describe("r2", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswR2handlers));

	runInTempDir();

	describe("bucket", () => {
		mockAccountId();
		mockApiToken();

		it("should show help when the bucket command is passed", async () => {
			await runWrangler("r2 bucket");
			await endEventLoop();
			expect(std.out).toMatchInlineSnapshot(`
				"wrangler r2 bucket

				Manage R2 buckets

				COMMANDS
				  wrangler r2 bucket create <name>    Create a new R2 bucket
				  wrangler r2 bucket update           Update bucket state
				  wrangler r2 bucket list             List R2 buckets
				  wrangler r2 bucket info <bucket>    Get information about an R2 bucket
				  wrangler r2 bucket delete <bucket>  Delete an R2 bucket
				  wrangler r2 bucket sippy            Manage Sippy incremental migration on an R2 bucket
				  wrangler r2 bucket catalog          Manage the data catalog for your R2 buckets - provides an Iceberg REST interface for query engines like Spark and PyIceberg [open beta]
				  wrangler r2 bucket notification     Manage event notification rules for an R2 bucket
				  wrangler r2 bucket domain           Manage custom domains for an R2 bucket
				  wrangler r2 bucket dev-url          Manage public access via the r2.dev URL for an R2 bucket
				  wrangler r2 bucket lifecycle        Manage lifecycle rules for an R2 bucket
				  wrangler r2 bucket cors             Manage CORS configuration for an R2 bucket
				  wrangler r2 bucket lock             Manage lock rules for an R2 bucket

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		it("should show the correct help when an invalid command is passed", async () => {
			await expect(() =>
				runWrangler("r2 bucket foo")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Unknown argument: foo]`
			);
			expect(std.err).toMatchInlineSnapshot(`
			          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

			          "
		        `);
			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 bucket

				Manage R2 buckets

				COMMANDS
				  wrangler r2 bucket create <name>    Create a new R2 bucket
				  wrangler r2 bucket update           Update bucket state
				  wrangler r2 bucket list             List R2 buckets
				  wrangler r2 bucket info <bucket>    Get information about an R2 bucket
				  wrangler r2 bucket delete <bucket>  Delete an R2 bucket
				  wrangler r2 bucket sippy            Manage Sippy incremental migration on an R2 bucket
				  wrangler r2 bucket catalog          Manage the data catalog for your R2 buckets - provides an Iceberg REST interface for query engines like Spark and PyIceberg [open beta]
				  wrangler r2 bucket notification     Manage event notification rules for an R2 bucket
				  wrangler r2 bucket domain           Manage custom domains for an R2 bucket
				  wrangler r2 bucket dev-url          Manage public access via the r2.dev URL for an R2 bucket
				  wrangler r2 bucket lifecycle        Manage lifecycle rules for an R2 bucket
				  wrangler r2 bucket cors             Manage CORS configuration for an R2 bucket
				  wrangler r2 bucket lock             Manage lock rules for an R2 bucket

				GLOBAL FLAGS
				  -c, --config    Path to Wrangler configuration file  [string]
				      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
				  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
				  -h, --help      Show help  [boolean]
				  -v, --version   Show version number  [boolean]"
			`);
		});

		describe("list", () => {
			it("should list buckets & check request inputs", async () => {
				const mockBuckets = [
					{
						name: "bucket-1-local-once",
						creation_date: "01-01-2001",
					},
					{
						name: "bucket-2-local-once",
						creation_date: "01-01-2001",
					},
				];
				msw.use(
					http.get(
						"*/accounts/:accountId/r2/buckets",
						async ({ request, params }) => {
							const { accountId } = params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.text()).toEqual("");
							return HttpResponse.json(
								createFetchResult({
									buckets: mockBuckets,
								})
							);
						},
						{ once: true }
					)
				);

				await runWrangler(`r2 bucket list`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Listing buckets...
					name:           bucket-1-local-once
					creation_date:  01-01-2001

					name:           bucket-2-local-once
					creation_date:  01-01-2001"
				`);
			});
		});

		describe("info", () => {
			const bucketName = "my-bucket";

			beforeEach(() => {
				const bucketInfo = {
					name: bucketName,
					creation_date: "01-01-2001",
					location: "WNAM",
					storage_class: "Standard",
				};

				msw.use(
					http.get(
						"*/accounts/:accountId/r2/buckets/:bucketName",
						async ({ params }) => {
							const { accountId, bucketName: bucketParam } = params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketParam).toEqual(bucketName);
							return HttpResponse.json(
								createFetchResult({
									...bucketInfo,
								})
							);
						},
						{ once: true }
					),
					http.post("*/graphql", async () => {
						return HttpResponse.json(createFetchResult({}));
					})
				);
			});

			it("should get information for the given bucket", async () => {
				await runWrangler(`r2 bucket info ${bucketName}`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Getting info for 'my-bucket'...
					name:                   my-bucket
					created:                01-01-2001
					location:               WNAM
					default_storage_class:  Standard
					object_count:           0
					bucket_size:            0 B"
				`);
			});

			it("should output valid JSON format when --json flag is used", async () => {
				await runWrangler(`r2 bucket info ${bucketName} --json`);
				const json = JSON.parse(std.out);
				expect(json.name).toBe(bucketName);
			});
		});

		describe("create", () => {
			it("should error if no bucket name is given", async () => {
				await expect(
					runWrangler("r2 bucket create")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket create <name>

					Create a new R2 bucket

					POSITIONALS
					  name  The name of the new bucket  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --location       The optional location hint that determines geographic placement of the R2 bucket  [string] [choices: \\"weur\\", \\"eeur\\", \\"apac\\", \\"wnam\\", \\"enam\\", \\"oc\\"]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]
					      --use-remote     Use a remote binding when adding the newly created resource to your config  [boolean]
					      --update-config  Automatically update your config file with the newly added resource  [boolean]
					      --binding        The binding name of this resource in your Worker  [string]"
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
					`[Error: Unknown arguments: def, ghi]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket create <name>

					Create a new R2 bucket

					POSITIONALS
					  name  The name of the new bucket  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					      --location       The optional location hint that determines geographic placement of the R2 bucket  [string] [choices: \\"weur\\", \\"eeur\\", \\"apac\\", \\"wnam\\", \\"enam\\", \\"oc\\"]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]
					      --use-remote     Use a remote binding when adding the newly created resource to your config  [boolean]
					      --update-config  Automatically update your config file with the newly added resource  [boolean]
					      --binding        The binding name of this resource in your Worker  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
			});

			describe.each(["wrangler.json", "wrangler.toml"])("%s", (configPath) => {
				it("should create a bucket & check request inputs", async () => {
					msw.use(
						http.post(
							"*/accounts/:accountId/r2/buckets",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({ name: "test-bucket" });
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					writeWranglerConfig({}, configPath);
					await runWrangler("r2 bucket create test-bucket");
					expect(std.out).toMatchSnapshot();
				});

				it("should create a bucket with the expected jurisdiction", async () => {
					msw.use(
						http.post(
							"*/accounts/:accountId/r2/buckets",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(request.headers.get("cf-r2-jurisdiction")).toEqual("eu");
								expect(await request.json()).toEqual({ name: "test-bucket" });
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					writeWranglerConfig({}, configPath);
					await runWrangler("r2 bucket create test-bucket -J eu");
					expect(std.out).toMatchSnapshot();
				});

				it("should create a bucket with the expected default storage class", async () => {
					writeWranglerConfig({}, configPath);
					await runWrangler("r2 bucket create test-bucket -s InfrequentAccess");
					expect(std.out).toMatchSnapshot();
				});

				it("should create a bucket with the expected location hint", async () => {
					msw.use(
						http.post(
							"*/accounts/:accountId/r2/buckets",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({
									name: "test-bucket",
									locationHint: "weur",
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					writeWranglerConfig({}, configPath);

					await runWrangler("r2 bucket create test-bucket --location weur");
					expect(std.out).toMatchSnapshot();
				});
			});

			it("should error if storage class is invalid", async () => {
				await expect(
					runWrangler("r2 bucket create test-bucket -s Foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[APIError: A request to the Cloudflare API (/accounts/some-account-id/r2/buckets) failed.]`
				);
				expect(std).toMatchInlineSnapshot(`
					Object {
					  "debug": "",
					  "err": "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/r2/buckets) failed.[0m

					  The JSON you provided was not well formed. [code: 10040]

					  If you think this is a bug, please open an issue at:
					  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

					",
					  "info": "",
					  "out": "
					 ⛅️ wrangler x.x.x
					──────────────────
					Creating bucket 'test-bucket'...
					",
					  "warn": "",
					}
				`);
			});
		});

		describe("update", () => {
			it("should error if invalid command is passed", async () => {
				await expect(
					runWrangler("r2 bucket update foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Unknown argument: foo]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket update

					Update bucket state

					COMMANDS
					  wrangler r2 bucket update storage-class <name>  Update the default storage class of an existing R2 bucket

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

				            "
			          `);
			});

			describe("storage-class", () => {
				it("should error if storage class is missing", async () => {
					await expect(
						runWrangler("r2 bucket update storage-class testBucket")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Missing required argument: storage-class]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket update storage-class <name>

						Update the default storage class of an existing R2 bucket

						POSITIONALS
						  name  The name of the existing bucket  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
						  -J, --jurisdiction   The jurisdiction of the bucket to be updated  [string]
						  -s, --storage-class  The new default storage class for this bucket  [string] [required]"
					`);
					expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing required argument: storage-class[0m

				            "
			          `);
				});

				it("should error if storage class is invalid", async () => {
					await expect(
						runWrangler("r2 bucket update storage-class testBucket -s Foo")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[APIError: A request to the Cloudflare API (/accounts/some-account-id/r2/buckets/testBucket) failed.]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Updating bucket testBucket to Foo default storage class.
						"
					`);
				});

				it("should update the default storage class", async () => {
					await runWrangler(
						"r2 bucket update storage-class testBucket -s InfrequentAccess"
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Updating bucket testBucket to InfrequentAccess default storage class.
						Updated bucket testBucket to InfrequentAccess default storage class."
					`);
				});
			});
		});

		describe("delete", () => {
			it("should error if no bucket name is given", async () => {
				await expect(
					runWrangler("r2 bucket delete")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket delete <bucket>

					Delete an R2 bucket

					POSITIONALS
					  bucket  The name of the bucket to delete  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				            "
			          `);
			});

			it("should error if the bucket name contains invalid characters", async () => {
				await expect(
					runWrangler("r2 bucket create abc_def")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "abc_def" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
				);
			});

			it("should error if the bucket name starts with a dash", async () => {
				await expect(
					runWrangler("r2 bucket create -abc")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
			});

			it("should error if the bucket name ends with a dash", async () => {
				await expect(
					runWrangler("r2 bucket create abc-")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "abc-" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
				);
			});

			it("should error if the bucket name is over 63 characters", async () => {
				await expect(
					runWrangler("r2 bucket create " + "a".repeat(64))
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.]`
				);
			});

			it("should error if the bucket name to delete contains spaces", async () => {
				await expect(
					runWrangler("r2 bucket delete abc def ghi")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Unknown arguments: def, ghi]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket delete <bucket>

					Delete an R2 bucket

					POSITIONALS
					  bucket  The name of the bucket to delete  [string] [required]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]

					OPTIONS
					  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
			});

			it("should delete a bucket specified by name & check requests inputs", async () => {
				msw.use(
					http.delete(
						"*/accounts/:accountId/r2/buckets/:bucketName",
						async ({ request, params }) => {
							const { accountId, bucketName } = params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketName).toEqual("some-bucket");
							expect(await request.text()).toEqual("");
							expect(request.headers.get("authorization")).toEqual(
								"Bearer some-api-token"
							);

							return HttpResponse.json(createFetchResult(null));
						},
						{ once: true }
					)
				);
				await runWrangler(`r2 bucket delete some-bucket`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Deleting bucket some-bucket.
					Deleted bucket some-bucket."
				`);
			});
		});

		describe("sippy", () => {
			const { setIsTTY } = useMockIsTTY();

			it("should show the correct help when an invalid command is passed", async () => {
				await expect(() =>
					runWrangler("r2 bucket sippy foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Unknown argument: foo]`
				);
				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

			"
		`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket sippy

					Manage Sippy incremental migration on an R2 bucket

					COMMANDS
					  wrangler r2 bucket sippy enable <name>   Enable Sippy on an R2 bucket
					  wrangler r2 bucket sippy disable <name>  Disable Sippy on an R2 bucket
					  wrangler r2 bucket sippy get <name>      Check the status of Sippy on an R2 bucket

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]"
				`);
			});

			describe("enable", () => {
				it("should enable sippy on AWS for the given bucket", async () => {
					setIsTTY(false);

					msw.use(
						http.put(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async ({ request }) => {
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
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						"r2 bucket sippy enable testBucket --r2-access-key-id=some-key --r2-secret-access-key=some-secret --provider=AWS --access-key-id=aws-key --secret-access-key=aws-secret --region=awsRegion --bucket=awsBucket"
					);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						✨ Successfully enabled Sippy on the 'testBucket' bucket."
					`
					);
				});

				it("should enable sippy on GCS for the given bucket", async () => {
					setIsTTY(false);

					msw.use(
						http.put(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async ({ request }) => {
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
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						"r2 bucket sippy enable testBucket --r2-access-key-id=some-key --r2-secret-access-key=some-secret --provider=GCS --client-email=gcs-client-email --private-key=gcs-private-key --bucket=gcsBucket"
					);
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						✨ Successfully enabled Sippy on the 'testBucket' bucket."
					`
					);
				});

				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket sippy enable")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket sippy enable <name>

						Enable Sippy on an R2 bucket

						POSITIONALS
						  name  The name of the bucket  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
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
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket sippy disable <name>

						Disable Sippy on an R2 bucket

						POSITIONALS
						  name  The name of the bucket  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
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
						http.delete(
							"*/accounts/some-account-id/r2/buckets/testBucket/sippy",
							async () => {
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler("r2 bucket sippy disable testBucket");
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						✨ Successfully disabled Sippy on the 'testBucket' bucket."
					`
					);
				});
			});

			describe("get", () => {
				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket sippy get")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket sippy get <name>

						Check the status of Sippy on an R2 bucket

						POSITIONALS
						  name  The name of the bucket  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
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
					http.get(
						"*/accounts/:accountId/r2/buckets/:bucketName/sippy",
						async ({ request, params }) => {
							const { accountId } = params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.text()).toEqual("");
							return HttpResponse.json(
								createFetchResult(
									"https://storage.googleapis.com/storage/v1/b/testBucket"
								)
							);
						},
						{ once: true }
					)
				);
				await runWrangler("r2 bucket sippy get testBucket");
				expect(std.out).toMatchInlineSnapshot(
					`
					"
					 ⛅️ wrangler x.x.x
					──────────────────
					Sippy configuration: https://storage.googleapis.com/storage/v1/b/testBucket"
				`
				);
			});
		});

		describe("catalog", () => {
			it("should show the correct help when an invalid command is passed", async () => {
				await expect(() =>
					runWrangler("r2 bucket catalog foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: Unknown argument: foo]`
				);
				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

			"
		`);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket catalog

					Manage the data catalog for your R2 buckets - provides an Iceberg REST interface for query engines like Spark and PyIceberg [open beta]

					COMMANDS
					  wrangler r2 bucket catalog enable <bucket>      Enable the data catalog on an R2 bucket [open beta]
					  wrangler r2 bucket catalog disable <bucket>     Disable the data catalog for an R2 bucket [open beta]
					  wrangler r2 bucket catalog get <bucket>         Get the status of the data catalog for an R2 bucket [open beta]
					  wrangler r2 bucket catalog compaction           Control settings for automatic file compaction maintenance jobs for your R2 data catalog [open beta]
					  wrangler r2 bucket catalog snapshot-expiration  Control settings for automatic snapshot expiration maintenance jobs for your R2 data catalog [open beta]

					GLOBAL FLAGS
					  -c, --config    Path to Wrangler configuration file  [string]
					      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
					  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
					  -h, --help      Show help  [boolean]
					  -v, --version   Show version number  [boolean]"
				`);
			});

			describe("enable", () => {
				it("should enable R2 catalog for the given bucket", async () => {
					msw.use(
						http.post(
							"*/accounts/some-account-id/r2-catalog/testBucket/enable",
							async () => {
								return HttpResponse.json(
									createFetchResult(
										{
											id: "test-warehouse-id",
											name: "test-account-id_test-warehouse-name",
										},
										true
									)
								);
							},
							{ once: true }
						)
					);
					await runWrangler("r2 bucket catalog enable testBucket");
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						✨ Successfully enabled data catalog on bucket 'testBucket'.

						Catalog URI: 'https://catalog.cloudflarestorage.com/test-account-id/test-warehouse-name'
						Warehouse: 'test-account-id_test-warehouse-name'

						Use this Catalog URI with Iceberg-compatible query engines (Spark, PyIceberg etc.) to query data as tables.
						Note: You will need a Cloudflare API token with 'R2 Data Catalog' permission to authenticate your client with this catalog.
						For more details, refer to: https://developers.cloudflare.com/r2/api/s3/tokens/"
					`
					);
				});

				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket catalog enable")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket catalog enable <bucket>

						Enable the data catalog on an R2 bucket [open beta]

						POSITIONALS
						  bucket  The name of the bucket to enable  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});
			});

			describe("disable", () => {
				const { setIsTTY } = useMockIsTTY();
				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket catalog disable")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket catalog disable <bucket>

						Disable the data catalog for an R2 bucket [open beta]

						POSITIONALS
						  bucket  The name of the bucket to disable the data catalog for  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});

				it("should disable R2 catalog for the given bucket", async () => {
					setIsTTY(true);
					mockConfirm({
						text: "Are you sure you want to disable the data catalog for bucket 'testBucket'?",
						result: true,
					});
					msw.use(
						http.post(
							"*/accounts/some-account-id/r2-catalog/testBucket/disable",
							async () => {
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler("r2 bucket catalog disable testBucket");
					expect(std.out).toMatchInlineSnapshot(
						`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Successfully disabled the data catalog on bucket 'testBucket'."
					`
					);
				});

				it("should inform user if the catalog was never enabled for the bucket", async () => {
					setIsTTY(true);
					mockConfirm({
						text: "Are you sure you want to disable the data catalog for bucket 'testBucket'?",
						result: true,
					});
					msw.use(
						http.post(
							"*/accounts/:accountId/r2-catalog/:bucketName/disable",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.text()).toEqual("");
								return HttpResponse.json(
									{
										success: false,
										errors: [
											{
												code: 40401,
												message: "Warehouse not found",
											},
										],
										result: null,
									},
									{ status: 404 }
								);
							},
							{ once: true }
						)
					);

					await runWrangler("r2 bucket catalog disable testBucket");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Data catalog is not enabled for bucket 'testBucket'. Please use 'wrangler r2 bucket catalog enable testBucket' to first enable the data catalog on this bucket."
					`);
				});
			});

			describe("get", () => {
				it("should error if no bucket name is given", async () => {
					await expect(
						runWrangler("r2 bucket catalog get")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket catalog get <bucket>

						Get the status of the data catalog for an R2 bucket [open beta]

						POSITIONALS
						  bucket  The name of the R2 bucket whose data catalog status to retrieve  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

				"
			`);
				});

				it("should get the catalog status for the given bucket", async () => {
					msw.use(
						http.get(
							"*/accounts/:accountId/r2-catalog/:bucketName",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.text()).toEqual("");
								return HttpResponse.json(
									createFetchResult(
										{
											id: "test-id",
											name: "test-account-id_test-name",
											bucket: "test-bucket",
											status: "active",
										},
										true
									)
								);
							},
							{ once: true }
						)
					);
					await runWrangler("r2 bucket catalog get test-bucket");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Getting data catalog status for 'test-bucket'...

						Catalog URI:  https://catalog.cloudflarestorage.com/test-account-id/test-name
						Warehouse:    test-account-id_test-name
						Status:       active"
					`);
				});

				it("should inform user if the catalog was never enabled for the bucket", async () => {
					msw.use(
						http.get(
							"*/accounts/:accountId/r2-catalog/:bucketName",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.text()).toEqual("");
								return HttpResponse.json(
									{
										success: false,
										errors: [
											{
												code: 40401,
												message: "Warehouse not found",
											},
										],
										result: null,
									},
									{ status: 404 }
								);
							},
							{ once: true }
						)
					);
					await runWrangler("r2 bucket catalog get test-bucket");
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Getting data catalog status for 'test-bucket'...

						Data catalog is not enabled for bucket 'test-bucket'. Please use 'wrangler r2 bucket catalog enable test-bucket' to first enable the data catalog on this bucket."
					`);
				});
			});

			describe("compaction", () => {
				it("should show the correct help when an invalid command is passed", async () => {
					await expect(() =>
						runWrangler("r2 bucket catalog compaction foo")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Unknown argument: foo]`
					);
					expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

				"
			`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket catalog compaction

						Control settings for automatic file compaction maintenance jobs for your R2 data catalog [open beta]

						COMMANDS
						  wrangler r2 bucket catalog compaction enable <bucket> [namespace] [table]   Enable automatic file compaction for your R2 data catalog or a specific table [open beta]
						  wrangler r2 bucket catalog compaction disable <bucket> [namespace] [table]  Disable automatic file compaction for your R2 data catalog or a specific table [open beta]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
				});

				describe("enable", () => {
					it("should enable compaction for the catalog", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/credential",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										token: "fakecloudflaretoken",
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							),
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										compaction: {
											state: "enabled",
											targetSizeMb: 512,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog compaction enable testBucket --token fakecloudflaretoken --target-size 512"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled file compaction for the data catalog for bucket 'testBucket'.

							Compaction will automatically combine small files into larger ones to improve query performance.
							For more details, refer to: https://developers.cloudflare.com/r2/data-catalog/about-compaction/"
						`
						);
					});

					it("should error if no bucket name is given", async () => {
						await expect(
							runWrangler("r2 bucket catalog compaction enable")
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Not enough non-option arguments: got 0, need at least 1]`
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							wrangler r2 bucket catalog compaction enable <bucket> [namespace] [table]

							Enable automatic file compaction for your R2 data catalog or a specific table [open beta]

							POSITIONALS
							  bucket     The name of the bucket which contains the catalog  [string] [required]
							  namespace  The namespace containing the table (optional, for table-level compaction)  [string]
							  table      The name of the table (optional, for table-level compaction)  [string]

							GLOBAL FLAGS
							  -c, --config    Path to Wrangler configuration file  [string]
							      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
							  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
							      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
							  -h, --help      Show help  [boolean]
							  -v, --version   Show version number  [boolean]

							OPTIONS
							      --target-size  The target size for compacted files in MB (allowed values: 64, 128, 256, 512)  [number] [default: 128]
							      --token        A cloudflare api token with access to R2 and R2 Data Catalog (required for catalog-level compaction settings only)  [string]"
						`);
						expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

					"
				`);
					});

					it("should error if --token is not provided for catalog-level", async () => {
						await expect(
							runWrangler(
								"r2 bucket catalog compaction enable testBucket --target-size 512"
							)
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Token is required for catalog-level compaction. Use --token flag to provide a Cloudflare API token.]`
						);
					});

					it("should enable table compaction without token", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										compaction: {
											state: "enabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog compaction enable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled file compaction for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should enable table compaction with custom target size", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										compaction: {
											state: "enabled",
											target_size_mb: 256,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog compaction enable testBucket testNamespace testTable --target-size 256"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled file compaction for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should error if only namespace is provided", async () => {
						await expect(
							runWrangler(
								"r2 bucket catalog compaction enable testBucket testNamespace"
							)
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Table name is required when namespace is specified]`
						);
					});

					it("should error if only table is provided", async () => {
						// This test ensures that if table is passed as namespace position, it errors properly
						await expect(
							runWrangler(
								'r2 bucket catalog compaction enable testBucket "" testTable'
							)
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Namespace is required when table is specified]`
						);
					});
				});

				describe("disable", () => {
					const { setIsTTY } = useMockIsTTY();

					it("should error if no bucket name is given", async () => {
						await expect(
							runWrangler("r2 bucket catalog compaction disable")
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Not enough non-option arguments: got 0, need at least 1]`
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							wrangler r2 bucket catalog compaction disable <bucket> [namespace] [table]

							Disable automatic file compaction for your R2 data catalog or a specific table [open beta]

							POSITIONALS
							  bucket     The name of the bucket which contains the catalog  [string] [required]
							  namespace  The namespace containing the table (optional, for table-level compaction)  [string]
							  table      The name of the table (optional, for table-level compaction)  [string]

							GLOBAL FLAGS
							  -c, --config    Path to Wrangler configuration file  [string]
							      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
							  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
							      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
							  -h, --help      Show help  [boolean]
							  -v, --version   Show version number  [boolean]"
						`);
						expect(std.err).toMatchInlineSnapshot(`
					"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

					"
				`);
					});

					it("should disable compaction with confirmation", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable file compaction for the data catalog for bucket 'testBucket'?",
							result: true,
						});
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(body).toEqual({
										compaction: {
											state: "disabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog compaction disable testBucket"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Successfully disabled file compaction for the data catalog for bucket 'testBucket'."
						`
						);
					});

					it("should cancel disable when confirmation is rejected", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable file compaction for the data catalog for bucket 'testBucket'?",
							result: false,
						});
						await runWrangler(
							"r2 bucket catalog compaction disable testBucket"
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Disable cancelled."
						`);
					});

					it("should disable table compaction when confirmed", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable file compaction for table 'testNamespace.testTable' in bucket 'testBucket'?",
							result: true,
						});
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										compaction: {
											state: "disabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog compaction disable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Successfully disabled file compaction for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should cancel table compaction disable when rejected", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable file compaction for table 'testNamespace.testTable' in bucket 'testBucket'?",
							result: false,
						});
						await runWrangler(
							"r2 bucket catalog compaction disable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Disable cancelled."
						`);
					});
				});
			});

			describe("snapshot-expiration", () => {
				it("should show the correct help when an invalid command is passed", async () => {
					await expect(() =>
						runWrangler("r2 bucket catalog snapshot-expiration foo")
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Unknown argument: foo]`
					);
					expect(std.err).toMatchInlineSnapshot(`
						"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: foo[0m

						"
					`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket catalog snapshot-expiration

						Control settings for automatic snapshot expiration maintenance jobs for your R2 data catalog [open beta]

						COMMANDS
						  wrangler r2 bucket catalog snapshot-expiration enable <bucket> [namespace] [table]   Enable automatic snapshot expiration for your R2 data catalog or a specific table [open beta]
						  wrangler r2 bucket catalog snapshot-expiration disable <bucket> [namespace] [table]  Disable automatic snapshot expiration for your R2 data catalog or a specific table [open beta]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]"
					`);
				});

				describe("enable", () => {
					it("should enable snapshot expiration for the catalog", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/credential",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										token: "fakecloudflaretoken",
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							),
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										snapshot_expiration: {
											state: "enabled",
											max_snapshot_age: "30d",
											min_snapshots_to_keep: 5,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration enable testBucket --token fakecloudflaretoken"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled snapshot expiration for the data catalog for bucket 'testBucket'.

							Snapshot expiration will automatically delete old table snapshots to save storage costs.
							For more details, refer to: https://developers.cloudflare.com/r2/data-catalog/"
						`
						);
					});

					it("should enable snapshot expiration with custom values", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/credential",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										token: "fakecloudflaretoken",
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							),
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										snapshot_expiration: {
											state: "enabled",
											max_snapshot_age: "60d",
											min_snapshots_to_keep: 10,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration enable testBucket --token fakecloudflaretoken --older-than-days 60 --retain-last 10"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled snapshot expiration for the data catalog for bucket 'testBucket'.

							Snapshot expiration will automatically delete old table snapshots to save storage costs.
							For more details, refer to: https://developers.cloudflare.com/r2/data-catalog/"
						`
						);
					});

					it("should error if no bucket name is given", async () => {
						await expect(
							runWrangler("r2 bucket catalog snapshot-expiration enable")
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Not enough non-option arguments: got 0, need at least 1]`
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							wrangler r2 bucket catalog snapshot-expiration enable <bucket> [namespace] [table]

							Enable automatic snapshot expiration for your R2 data catalog or a specific table [open beta]

							POSITIONALS
							  bucket     The name of the bucket which contains the catalog  [string] [required]
							  namespace  The namespace containing the table (optional, for table-level snapshot expiration)  [string]
							  table      The name of the table (optional, for table-level snapshot expiration)  [string]

							GLOBAL FLAGS
							  -c, --config    Path to Wrangler configuration file  [string]
							      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
							  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
							      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
							  -h, --help      Show help  [boolean]
							  -v, --version   Show version number  [boolean]

							OPTIONS
							      --older-than-days  Delete snapshots older than this many days, defaults to 30  [number]
							      --retain-last      The minimum number of snapshots to retain, defaults to 5  [number]
							      --token            A cloudflare api token with access to R2 and R2 Data Catalog (required for catalog-level snapshot expiration settings only)  [string]"
						`);
						expect(std.err).toMatchInlineSnapshot(`
							"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

							"
						`);
					});

					it("should enable table snapshot expiration", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										snapshot_expiration: {
											state: "enabled",
											older_than_days: 30,
											retain_last: 5,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration enable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled snapshot expiration for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should enable table snapshot expiration with custom values", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										snapshot_expiration: {
											state: "enabled",
											older_than_days: 7,
											retain_last: 3,
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration enable testBucket testNamespace testTable --older-than-days 7 --retain-last 3"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							✨ Successfully enabled snapshot expiration for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should error if token is missing for catalog-level operation", async () => {
						await expect(
							runWrangler(
								"r2 bucket catalog snapshot-expiration enable testBucket"
							)
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Token is required for catalog-level snapshot expiration. Use --token flag to provide a Cloudflare API token.]`
						);
					});
				});

				describe("disable", () => {
					const { setIsTTY } = useMockIsTTY();

					it("should error if no bucket name is given", async () => {
						await expect(
							runWrangler("r2 bucket catalog snapshot-expiration disable")
						).rejects.toThrowErrorMatchingInlineSnapshot(
							`[Error: Not enough non-option arguments: got 0, need at least 1]`
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							wrangler r2 bucket catalog snapshot-expiration disable <bucket> [namespace] [table]

							Disable automatic snapshot expiration for your R2 data catalog or a specific table [open beta]

							POSITIONALS
							  bucket     The name of the bucket which contains the catalog  [string] [required]
							  namespace  The namespace containing the table (optional, for table-level snapshot expiration)  [string]
							  table      The name of the table (optional, for table-level snapshot expiration)  [string]

							GLOBAL FLAGS
							  -c, --config    Path to Wrangler configuration file  [string]
							      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
							  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
							      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
							  -h, --help      Show help  [boolean]
							  -v, --version   Show version number  [boolean]

							OPTIONS
							      --force  Skip confirmation prompt  [boolean] [default: false]"
						`);
						expect(std.err).toMatchInlineSnapshot(`
							"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

							"
						`);
					});

					it("should disable snapshot expiration with confirmation", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable snapshot expiration for the data catalog for bucket 'testBucket'?",
							result: true,
						});
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(body).toEqual({
										snapshot_expiration: {
											state: "disabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration disable testBucket"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Successfully disabled snapshot expiration for the data catalog for bucket 'testBucket'."
						`
						);
					});

					it("should cancel disable when confirmation is rejected", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable snapshot expiration for the data catalog for bucket 'testBucket'?",
							result: false,
						});
						await runWrangler(
							"r2 bucket catalog snapshot-expiration disable testBucket"
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Disable cancelled."
						`);
					});

					it("should disable table snapshot expiration when confirmed", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable snapshot expiration for table 'testNamespace.testTable' in bucket 'testBucket'?",
							result: true,
						});
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/namespaces/testNamespace/tables/testTable/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(request.method).toEqual("POST");
									expect(body).toEqual({
										snapshot_expiration: {
											state: "disabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration disable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Successfully disabled snapshot expiration for table 'testNamespace.testTable' in bucket 'testBucket'."
						`
						);
					});

					it("should cancel table snapshot expiration disable when rejected", async () => {
						setIsTTY(true);
						mockConfirm({
							text: "Are you sure you want to disable snapshot expiration for table 'testNamespace.testTable' in bucket 'testBucket'?",
							result: false,
						});
						await runWrangler(
							"r2 bucket catalog snapshot-expiration disable testBucket testNamespace testTable"
						);
						expect(std.out).toMatchInlineSnapshot(`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Disable cancelled."
						`);
					});

					it("should disable with --force flag without confirmation", async () => {
						msw.use(
							http.post(
								"*/accounts/some-account-id/r2-catalog/testBucket/maintenance-configs",
								async ({ request }) => {
									const body = await request.json();
									expect(body).toEqual({
										snapshot_expiration: {
											state: "disabled",
										},
									});
									return HttpResponse.json(
										createFetchResult({ success: true }, true)
									);
								},
								{ once: true }
							)
						);
						await runWrangler(
							"r2 bucket catalog snapshot-expiration disable testBucket --force"
						);
						expect(std.out).toMatchInlineSnapshot(
							`
							"
							 ⛅️ wrangler x.x.x
							──────────────────
							Successfully disabled snapshot expiration for the data catalog for bucket 'testBucket'."
						`
						);
					});
				});
			});
		});

		describe("notification", () => {
			describe("list", () => {
				it("follows happy path as expected", async () => {
					const bucketName = "my-bucket";
					const queueId = "471537e8-6e5a-4163-a4d4-9478087c32c3";
					const queueName = "my-queue";
					msw.use(
						http.get(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								const getResponse = {
									bucketName,
									queues: [
										{
											queueId: queueId,
											queueName,
											rules: [
												{
													ruleId: "8cdcce8a-89b3-474f-a087-3eb4fcacfa37",
													createdAt: "2024-09-05T01:02:03.000Z",
													prefix: "",
													suffix: "",
													actions: [
														"PutObject",
														"CompleteMultipartUpload",
														"CopyObject",
													],
												},
											],
										},
									],
								};
								return HttpResponse.json(createFetchResult(getResponse));
							},
							{ once: true }
						)
					);
					await expect(
						await runWrangler(`r2 bucket notification list ${bucketName}`)
					).toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Fetching notification rules for bucket my-bucket...
						rule_id:     8cdcce8a-89b3-474f-a087-3eb4fcacfa37
						created_at:  2024-09-05T01:02:03.000Z
						queue_name:  my-queue
						prefix:      (all prefixes)
						suffix:      (all suffixes)
						event_type:  PutObject,CompleteMultipartUpload,CopyObject"
					`);
				});

				it("is backwards compatible with old API version", async () => {
					const bucketName = "my-bucket";
					const queueId = "471537e8-6e5a-4163-a4d4-9478087c32c3";
					const queueName = "my-queue";
					msw.use(
						http.get(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								const getResponse = {
									[bucketName]: {
										"9d738cb7-be18-433a-957f-a9b88793de2c": {
											queue: queueId,
											rules: [
												{
													prefix: "",
													suffix: "",
													actions: [
														"PutObject",
														"CompleteMultipartUpload",
														"CopyObject",
													],
												},
											],
										},
									},
								};
								return HttpResponse.json(createFetchResult(getResponse));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues/:queueId",
							async ({ request, params }) => {
								const { accountId, queueId: queueParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(queueParam).toEqual(queueId);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(
									createFetchResult({ queue_name: queueName })
								);
							},
							{ once: true }
						)
					);
					await expect(
						await runWrangler(`r2 bucket notification list ${bucketName}`)
					).toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Fetching notification rules for bucket my-bucket...
						rule_id:
						created_at:
						queue_name:  my-queue
						prefix:      (all prefixes)
						suffix:      (all suffixes)
						event_type:  PutObject,CompleteMultipartUpload,CopyObject"
					`);
				});

				it("shows correct output on error", async () => {
					await expect(
						runWrangler(`r2 bucket notification list`)
					).rejects.toMatchInlineSnapshot(
						`[Error: Not enough non-option arguments: got 0, need at least 1]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket notification list <bucket>

						List event notification rules for an R2 bucket

						POSITIONALS
						  bucket  The name of the R2 bucket to get event notification rules for  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
						  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
					`);
				});
			});
			describe("create", () => {
				it("follows happy path as expected", async () => {
					const eventTypes: R2EventType[] = ["object-create", "object-delete"];
					const actions: R2EventableOperation[] = [];
					const bucketName = "my-bucket";
					const queue = "my-queue";

					const config: PutNotificationRequestBody = {
						rules: [
							{
								actions: eventTypes.reduce(
									(acc, et) => acc.concat(actionsForEventCategories[et]),
									actions
								),
							},
						],
					};
					msw.use(
						http.put(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({
									...config,
									// We fill in `prefix` & `suffix` with empty strings if not
									// provided
									rules: [{ ...config.rules[0], prefix: "", suffix: "" }],
								});
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification create ${bucketName} --queue ${queue} --event-types ${eventTypes.join(
								" "
							)}`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
						Event notification rule created successfully!"
					`);
				});

				it("follows happy path as expected with prefix", async () => {
					const eventTypes: R2EventType[] = ["object-create", "object-delete"];
					const actions: R2EventableOperation[] = [];
					const bucketName = "my-bucket";
					const queue = "my-queue";

					const config: PutNotificationRequestBody = {
						rules: [
							{
								actions: eventTypes.reduce(
									(acc, et) => acc.concat(actionsForEventCategories[et]),
									actions
								),
								prefix: "ruleprefix",
							},
						],
					};
					msw.use(
						http.put(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({
									...config,
									// We fill in `prefix` & `suffix` with empty strings if not
									// provided
									rules: [{ ...config.rules[0], suffix: "" }],
								});
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification create ${bucketName} --queue ${queue} --event-types ${eventTypes.join(
								" "
							)} --prefix "ruleprefix"`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
						Event notification rule created successfully!"
					`);
				});

				it("follows happy path as expected with suffix", async () => {
					const eventTypes: R2EventType[] = ["object-create", "object-delete"];
					const actions: R2EventableOperation[] = [];
					const bucketName = "my-bucket";
					const queue = "my-queue";

					const config: PutNotificationRequestBody = {
						rules: [
							{
								actions: eventTypes.reduce(
									(acc, et) => acc.concat(actionsForEventCategories[et]),
									actions
								),
								suffix: "rulesuffix",
							},
						],
					};
					msw.use(
						http.put(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({
									...config,
									// We fill in `prefix` & `suffix` with empty strings if not
									// provided
									rules: [{ ...config.rules[0], prefix: "" }],
								});
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification create ${bucketName} --queue ${queue} --event-types ${eventTypes.join(
								" "
							)} --suffix "rulesuffix"`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
						Event notification rule created successfully!"
					`);
				});

				it("follows happy path as expected with description", async () => {
					const eventTypes: R2EventType[] = ["object-create", "object-delete"];
					const actions: R2EventableOperation[] = [];
					const bucketName = "my-bucket";
					const queue = "my-queue";

					const config: PutNotificationRequestBody = {
						rules: [
							{
								actions: eventTypes.reduce(
									(acc, et) => acc.concat(actionsForEventCategories[et]),
									actions
								),
								description: "rule description",
							},
						],
					};
					msw.use(
						http.put(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(await request.json()).toEqual({
									...config,
									// We fill in `prefix` & `suffix` with empty strings if not
									// provided
									rules: [
										{
											...config.rules[0],
											prefix: "",
											suffix: "",
										},
									],
								});
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification create ${bucketName} --queue ${queue} --event-types ${eventTypes.join(
								" "
							)} --description "rule description"`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
						Event notification rule created successfully!"
					`);
				});

				it("errors if required options are not provided", async () => {
					await expect(
						runWrangler("r2 bucket notification create notification-test-001")
					).rejects.toMatchInlineSnapshot(
						`[Error: Missing required arguments: event-types, queue]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket notification create <bucket>

						Create an event notification rule for an R2 bucket

						POSITIONALS
						  bucket  The name of the R2 bucket to create an event notification rule for  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
						      --event-types, --event-type  The type of event(s) that will emit event notifications  [array] [required] [choices: \\"object-create\\", \\"object-delete\\"]
						      --prefix                     The prefix that an object must match to emit event notifications (note: regular expressions not supported)  [string]
						      --suffix                     The suffix that an object must match to emit event notifications (note: regular expressions not supported)  [string]
						      --queue                      The name of the queue that will receive event notification messages  [string] [required]
						  -J, --jurisdiction               The jurisdiction where the bucket exists  [string]
						      --description                A description that can be used to identify the event notification rule after creation  [string]"
					`);
				});
			});

			describe("delete", () => {
				it("follows happy path as expected without specified rules", async () => {
					const bucketName = "my-bucket";
					const queue = "my-queue";
					msw.use(
						http.delete(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(request.body).toBeNull();
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification delete ${bucketName} --queue ${queue}`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Deleting event notification rules associated with queue my-queue...
						Event notification rule deleted successfully!"
					`);
				});

				it("follows happy path as expected with specified rules", async () => {
					const bucketName = "my-bucket";
					const queue = "my-queue";
					const ruleId = "rule123456789";
					msw.use(
						http.delete(
							"*/accounts/:accountId/event_notifications/r2/:bucketName/configuration/queues/:queueUUID",
							async ({ request, params }) => {
								const { accountId } = params;
								expect(accountId).toEqual("some-account-id");
								expect(request.body).not.toBeNull();
								const requestBody = await request.text();
								expect(requestBody).toContain(`"ruleIds":["${ruleId}"]`);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						),
						http.get(
							"*/accounts/:accountId/queues?*",
							async ({ request, params }) => {
								const url = new URL(request.url);
								const { accountId } = params;
								const nameParams = url.searchParams.getAll("name");

								expect(accountId).toEqual("some-account-id");
								expect(nameParams[0]).toEqual(queue);
								expect(request.headers.get("authorization")).toEqual(
									"Bearer some-api-token"
								);
								return HttpResponse.json({
									success: true,
									errors: [],
									messages: [],
									result: [
										{
											queue_id: "queue-id",
											queue_name: queue,
											created_on: "",
											producers: [],
											consumers: [],
											producers_total_count: 1,
											consumers_total_count: 0,
											modified_on: "",
										},
									],
								});
							},
							{ once: true }
						)
					);
					await expect(
						runWrangler(
							`r2 bucket notification delete ${bucketName} --queue ${queue} --rule ${ruleId}`
						)
					).resolves.toBe(undefined);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Deleting event notifications rule \\"rule123456789\\"...
						Event notification rule deleted successfully!"
					`);
				});

				it("errors if required options are not provided", async () => {
					await expect(
						runWrangler("r2 bucket notification delete notification-test-001")
					).rejects.toMatchInlineSnapshot(
						`[Error: Missing required argument: queue]`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						wrangler r2 bucket notification delete <bucket>

						Delete an event notification rule from an R2 bucket

						POSITIONALS
						  bucket  The name of the R2 bucket to delete an event notification rule for  [string] [required]

						GLOBAL FLAGS
						  -c, --config    Path to Wrangler configuration file  [string]
						      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
						  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
						  -h, --help      Show help  [boolean]
						  -v, --version   Show version number  [boolean]

						OPTIONS
						      --queue         The name of the queue that corresponds to the event notification rule. If no rule is provided, all event notification rules associated with the bucket and queue will be deleted  [string] [required]
						      --rule          The ID of the event notification rule to delete  [string]
						  -J, --jurisdiction  The jurisdiction where the bucket exists  [string]"
					`);
				});
			});
		});
		describe("domain", () => {
			const { setIsTTY } = useMockIsTTY();
			mockAccountId();
			mockApiToken();
			describe("get", () => {
				it("should get custom domain for the bucket as expected", async () => {
					const bucketName = "my-bucket";
					const domainName = "test.com";
					const mockDomain = {
						domain: domainName,
						enabled: false,
						status: {
							ownership: "pending",
							ssl: "pending",
						},
						minTLS: "1.0",
						zoneId: "zone-id-456",
						zoneName: "test-zone",
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/custom/:domainName",
							async ({ params }) => {
								const {
									accountId,
									bucketName: bucketParam,
									domainName: domainParam,
								} = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								expect(domainParam).toEqual(domainName);
								return HttpResponse.json(createFetchResult(mockDomain));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket domain get ${bucketName} --domain ${domainName}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Retrieving custom domain 'test.com' connected to bucket 'my-bucket'...
						domain:            test.com
						enabled:           No
						ownership_status:  pending
						ssl_status:        pending
						min_tls_version:   1.0
						zone_id:           zone-id-456
						zone_name:         test-zone"
					`);
				});
			});
			describe("add", () => {
				it("should add custom domain to the bucket as expected", async () => {
					const bucketName = "my-bucket";
					const domainName = "example.com";
					const zoneId = "zone-id-123";

					setIsTTY(true);
					mockConfirm({
						text:
							`Are you sure you want to add the custom domain '${domainName}' to bucket '${bucketName}'? ` +
							`The contents of your bucket will be made publicly available at 'https://${domainName}'`,
						result: true,
					});
					msw.use(
						http.post(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/custom",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									domain: domainName,
									zoneId: zoneId,
									enabled: true,
									minTLS: "1.0",
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket domain add ${bucketName} --domain ${domainName} --zone-id ${zoneId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Connecting custom domain 'example.com' to bucket 'my-bucket'...
						✨ Custom domain 'example.com' connected successfully."
					`);
				});

				it("should error if domain and zone-id are not provided", async () => {
					const bucketName = "my-bucket";
					await expect(
						runWrangler(`r2 bucket domain add ${bucketName}`)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Missing required arguments: domain, zone-id]`
					);
					expect(std.err).toMatchInlineSnapshot(`
						"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mMissing required arguments: domain, zone-id[0m

						"
					  `);
				});
			});
			describe("list", () => {
				it("should list custom domains for a bucket as expected", async () => {
					const bucketName = "my-bucket";
					const mockDomains = [
						{
							domain: "example.com",
							enabled: true,
							status: {
								ownership: "verified",
								ssl: "active",
							},
							minTLS: "1.2",
							zoneId: "zone-id-123",
							zoneName: "example-zone",
						},
						{
							domain: "test.com",
							enabled: false,
							status: {
								ownership: "pending",
								ssl: "pending",
							},
							minTLS: "1.0",
							zoneId: "zone-id-456",
							zoneName: "test-zone",
						},
					];
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/custom",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										domains: mockDomains,
									})
								);
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket domain list ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Listing custom domains connected to bucket 'my-bucket'...
						domain:            example.com
						enabled:           Yes
						ownership_status:  verified
						ssl_status:        active
						min_tls_version:   1.2
						zone_id:           zone-id-123
						zone_name:         example-zone

						domain:            test.com
						enabled:           No
						ownership_status:  pending
						ssl_status:        pending
						min_tls_version:   1.0
						zone_id:           zone-id-456
						zone_name:         test-zone"
					`);
				});
			});
			describe("remove", () => {
				it("should remove a custom domain as expected", async () => {
					const bucketName = "my-bucket";
					const domainName = "example.com";
					setIsTTY(true);
					mockConfirm({
						text:
							`Are you sure you want to remove the custom domain '${domainName}' from bucket '${bucketName}'? ` +
							`Your bucket will no longer be available from 'https://${domainName}'`,
						result: true,
					});
					msw.use(
						http.delete(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/custom/:domainName",
							async ({ params }) => {
								const {
									accountId,
									bucketName: bucketParam,
									domainName: domainParam,
								} = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								expect(domainParam).toEqual(domainName);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket domain remove ${bucketName} --domain ${domainName}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Removing custom domain 'example.com' from bucket 'my-bucket'...
						Custom domain 'example.com' removed successfully."
					`);
				});
			});
			describe("update", () => {
				it("should update a custom domain as expected", async () => {
					const bucketName = "my-bucket";
					const domainName = "example.com";
					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/custom/:domainName",
							async ({ request, params }) => {
								const {
									accountId,
									bucketName: bucketParam,
									domainName: domainParam,
								} = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								expect(domainParam).toEqual(domainName);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									domain: domainName,
									minTLS: "1.3",
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket domain update ${bucketName} --domain ${domainName} --min-tls 1.3`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Updating custom domain 'example.com' for bucket 'my-bucket'...
						✨ Custom domain 'example.com' updated successfully."
					`);
				});
			});
		});
		describe("dev-url", () => {
			const { setIsTTY } = useMockIsTTY();
			mockAccountId();
			mockApiToken();
			describe("get", () => {
				it("should retrieve the r2.dev URL of a bucket when public access is enabled", async () => {
					const bucketName = "my-bucket";
					const domainInfo = {
						bucketId: "bucket-id-123",
						domain: "pub-bucket-id-123.r2.dev",
						enabled: true,
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/managed",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult({ ...domainInfo }));
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket dev-url get ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Public access is enabled at 'https://pub-bucket-id-123.r2.dev'."
					`);
				});

				it("should show that public access is disabled when it is disabled", async () => {
					const bucketName = "my-bucket";
					const domainInfo = {
						bucketId: "bucket-id-123",
						domain: "pub-bucket-id-123.r2.dev",
						enabled: false,
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/managed",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult({ ...domainInfo }));
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket dev-url get ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Public access via the r2.dev URL is disabled."
					`);
				});
			});

			describe("enable", () => {
				it("should enable public access", async () => {
					const bucketName = "my-bucket";
					const domainInfo = {
						bucketId: "bucket-id-123",
						domain: "pub-bucket-id-123.r2.dev",
						enabled: true,
					};

					setIsTTY(true);
					mockConfirm({
						text:
							`Are you sure you enable public access for bucket '${bucketName}'? ` +
							`The contents of your bucket will be made publicly available at its r2.dev URL`,
						result: true,
					});
					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/managed",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								const requestBody = await request.json();
								expect(requestBody).toEqual({ enabled: true });
								return HttpResponse.json(createFetchResult({ ...domainInfo }));
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket dev-url enable ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Enabling public access for bucket 'my-bucket'...
						✨ Public access enabled at 'https://pub-bucket-id-123.r2.dev'."
					`);
				});
			});

			describe("disable", () => {
				it("should disable public access", async () => {
					const bucketName = "my-bucket";
					const domainInfo = {
						bucketId: "bucket-id-123",
						domain: "pub-bucket-id-123.r2.dev",
						enabled: false,
					};

					setIsTTY(true);
					mockConfirm({
						text:
							`Are you sure you disable public access for bucket '${bucketName}'? ` +
							`The contents of your bucket will no longer be publicly available at its r2.dev URL`,
						result: true,
					});
					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/domains/managed",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								const requestBody = await request.json();
								expect(requestBody).toEqual({ enabled: false });
								return HttpResponse.json(createFetchResult({ ...domainInfo }));
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket dev-url disable ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Disabling public access for bucket 'my-bucket'...
						Public access disabled at 'https://pub-bucket-id-123.r2.dev'."
					`);
				});
			});
		});
		describe("lifecycle", () => {
			const { setIsTTY } = useMockIsTTY();
			mockAccountId();
			mockApiToken();
			describe("list", () => {
				it("should list lifecycle rules when they exist", async () => {
					const bucketName = "my-bucket";
					const lifecycleRules = [
						{
							id: "rule-1",
							enabled: true,
							conditions: { prefix: "images/" },
							deleteObjectsTransition: {
								condition: {
									type: "Age",
									maxAge: 2592000,
								},
							},
						},
					];
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										rules: lifecycleRules,
									})
								);
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket lifecycle list ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Listing lifecycle rules for bucket 'my-bucket'...
						name:     rule-1
						enabled:  Yes
						prefix:   images/
						action:   Expire objects after 30 days"
					`);
				});
			});
			describe("add", () => {
				it("it should add an age lifecycle rule using command-line arguments", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const prefix = "images/";
					const conditionType = "Age";
					const conditionValue = "30";

					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										rules: [],
									})
								);
							},
							{ once: true }
						),
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									rules: [
										{
											id: ruleId,
											enabled: true,
											conditions: { prefix: prefix },
											deleteObjectsTransition: {
												condition: {
													type: conditionType,
													maxAge: 2592000,
												},
											},
										},
									],
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket lifecycle add ${bucketName} --name ${ruleId} --prefix ${prefix} --expire-days ${conditionValue}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lifecycle rule 'my-rule' to bucket 'my-bucket'...
						✨ Added lifecycle rule 'my-rule' to bucket 'my-bucket'."
					`);
				});

				it("it should add a date lifecycle rule using command-line arguments and id alias", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const prefix = "images/";
					const conditionType = "Date";
					const conditionValue = "2025-01-30";

					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										rules: [],
									})
								);
							},
							{ once: true }
						),
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									rules: [
										{
											id: ruleId,
											enabled: true,
											conditions: { prefix: prefix },
											deleteObjectsTransition: {
												condition: {
													type: conditionType,
													date: "2025-01-30T00:00:00.000Z",
												},
											},
										},
									],
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket lifecycle add ${bucketName} --id ${ruleId} --prefix ${prefix} --expire-date ${conditionValue}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lifecycle rule 'my-rule' to bucket 'my-bucket'...
						✨ Added lifecycle rule 'my-rule' to bucket 'my-bucket'."
					`);
				});
			});
			describe("remove", () => {
				it("should remove a lifecycle rule as expected", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const lifecycleRules = {
						rules: [
							{
								id: ruleId,
								enabled: true,
								conditions: {},
							},
						],
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult(lifecycleRules));
							},
							{ once: true }
						),
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									rules: [],
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket lifecycle remove ${bucketName} --name ${ruleId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Removing lifecycle rule 'my-rule' from bucket 'my-bucket'...
						Lifecycle rule 'my-rule' removed from bucket 'my-bucket'."
					`);
				});
				it("should remove a lifecycle rule as expected with id alias", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const lifecycleRules = {
						rules: [
							{
								id: ruleId,
								enabled: true,
								conditions: {},
							},
						],
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult(lifecycleRules));
							},
							{ once: true }
						),
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									rules: [],
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(
						`r2 bucket lifecycle remove ${bucketName} --id ${ruleId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Removing lifecycle rule 'my-rule' from bucket 'my-bucket'...
						Lifecycle rule 'my-rule' removed from bucket 'my-bucket'."
					`);
				});
				it("should handle removing non-existant rule ID as expected", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const lifecycleRules = {
						rules: [],
					};
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult(lifecycleRules));
							},
							{ once: true }
						)
					);
					await expect(() =>
						runWrangler(
							`r2 bucket lifecycle remove ${bucketName} --name ${ruleId}`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						"[Error: Lifecycle rule with ID 'my-rule' not found in configuration for 'my-bucket'.]"
					);
				});
			});
			describe("set", () => {
				it("should set lifecycle configuration from a JSON file", async () => {
					const bucketName = "my-bucket";
					const filePath = "lifecycle-configuration.json";
					const lifecycleRules = {
						rules: [
							{
								id: "rule-1",
								enabled: true,
								conditions: {},
								deleteObjectsTransition: {
									condition: {
										type: "Age",
										maxAge: 2592000,
									},
								},
							},
						],
					};

					fs.writeFileSync(filePath, JSON.stringify(lifecycleRules));

					setIsTTY(true);
					mockConfirm({
						text: `Are you sure you want to overwrite all existing lifecycle rules for bucket '${bucketName}'?`,
						result: true,
					});

					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lifecycle",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									...lifecycleRules,
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);

					await runWrangler(
						`r2 bucket lifecycle set ${bucketName} --file ${filePath}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Setting lifecycle configuration (1 rules) for bucket 'my-bucket'...
						✨ Set lifecycle configuration for bucket 'my-bucket'."
					`);
				});
			});
		});
		describe("cors", () => {
			const { setIsTTY } = useMockIsTTY();
			mockAccountId();
			mockApiToken();
			describe("list", () => {
				it("should list CORS rules when they exist", async () => {
					const bucketName = "my-bucket";
					const corsRules = [
						{
							allowed: {
								origins: ["https://www.example.com"],
								methods: ["GET", "PUT"],
								headers: ["Content-Type", "Authorization"],
							},
							exposeHeaders: ["ETag", "Content-Length"],
							maxAgeSeconds: 8640,
						},
					];

					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/cors",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										rules: corsRules,
									})
								);
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket cors list ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Listing CORS rules for bucket 'my-bucket'...
						allowed_origins:  https://www.example.com
						allowed_methods:  GET, PUT
						allowed_headers:  Content-Type, Authorization
						exposed_headers:  ETag, Content-Length
						max_age_seconds:  8640"
					`);
				});
			});
			describe("set", () => {
				it("should set CORS configuration from a JSON file", async () => {
					const bucketName = "my-bucket";
					const filePath = "cors-configuration.json";
					const corsRules = {
						rules: [
							{
								allowed: {
									origins: ["https://www.example.com"],
									methods: ["GET", "PUT"],
									headers: ["Content-Type", "Authorization"],
								},
								exposeHeaders: ["ETag", "Content-Length"],
								maxAgeSeconds: 8640,
							},
						],
					};

					fs.writeFileSync(filePath, JSON.stringify(corsRules));

					setIsTTY(true);
					mockConfirm({
						text: `Are you sure you want to overwrite the existing CORS configuration for bucket '${bucketName}'?`,
						result: true,
					});

					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/cors",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									...corsRules,
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);

					await runWrangler(
						`r2 bucket cors set ${bucketName} --file ${filePath}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Setting CORS configuration (1 rules) for bucket 'my-bucket'...
						✨ Set CORS configuration for bucket 'my-bucket'."
					`);
				});
			});
			describe("delete", () => {
				it("should delete CORS configuration as expected", async () => {
					const bucketName = "my-bucket";
					const corsRules = {
						rules: [
							{
								allowed: {
									origins: ["https://www.example.com"],
									methods: ["GET", "PUT"],
									headers: ["Content-Type", "Authorization"],
								},
								exposeHeaders: ["ETag", "Content-Length"],
								maxAgeSeconds: 8640,
							},
						],
					};
					setIsTTY(true);
					mockConfirm({
						text: `Are you sure you want to clear the existing CORS configuration for bucket '${bucketName}'?`,
						result: true,
					});
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/cors",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(createFetchResult(corsRules));
							},
							{ once: true }
						),
						http.delete(
							"*/accounts/:accountId/r2/buckets/:bucketName/cors",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket cors delete ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Deleting the CORS configuration for bucket 'my-bucket'...
						CORS configuration deleted for bucket 'my-bucket'."
					`);
				});
			});
		});
		describe("lock", () => {
			const { setIsTTY } = useMockIsTTY();
			mockAccountId();
			mockApiToken();
			describe("list", () => {
				it("should list lock rules when they exist", async () => {
					const bucketName = "my-bucket";
					const lockRules = [
						{
							id: "rule-age",
							enabled: true,
							prefix: "images/age",
							condition: {
								type: "Age",
								maxAgeSeconds: 86400,
							},
						},
						{
							id: "rule-date",
							enabled: true,
							prefix: "images/date",
							condition: {
								type: "Date",
								date: 1738277955891,
							},
						},
						{
							id: "rule-indefinite",
							enabled: true,
							prefix: "images/indefinite",
							condition: {
								type: "Indefinite",
							},
						},
					];
					msw.use(
						http.get(
							"*/accounts/:accountId/r2/buckets/:bucketName/lock",
							async ({ params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketParam).toEqual(bucketName);
								return HttpResponse.json(
									createFetchResult({
										rules: lockRules,
									})
								);
							},
							{ once: true }
						)
					);
					await runWrangler(`r2 bucket lock list ${bucketName}`);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Listing lock rules for bucket 'my-bucket'...
						name:       rule-age
						enabled:    Yes
						prefix:     images/age
						condition:  after 1 day

						name:       rule-date
						enabled:    Yes
						prefix:     images/date
						condition:  on 2025-01-30

						name:       rule-indefinite
						enabled:    Yes
						prefix:     images/indefinite
						condition:  indefinitely"
					`);
				});
			});
			describe("add", () => {
				it("it should add a lock rule without prefix using command-line arguments", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-no-prefix",
							enabled: true,
							condition: {
								type: "Age",
								maxAgeSeconds: 86400,
							},
						},
					]);

					mockPrompt({
						text: 'Enter a prefix for the bucket lock rule (set to "" for all prefixes)',
						options: { defaultValue: "" },
						result: "",
					});
					mockConfirm({
						text:
							`Are you sure you want to add lock rule 'rule-no-prefix' to bucket '${bucketName}' without a prefix? ` +
							`The lock rule will apply to all objects in your bucket.`,
						result: true,
					});
					await runWrangler(
						`r2 bucket lock add ${bucketName} --name "rule-no-prefix" --retention-days 1`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lock rule 'rule-no-prefix' to bucket 'my-bucket'...
						✨ Added lock rule 'rule-no-prefix' to bucket 'my-bucket'."
					`);
				});
				it("it should fail to add lock rule using command-line arguments without condition", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockGetExistingRules(bucketName, []);

					mockConfirm({
						text:
							`Are you sure you want to add lock rule 'rule-not-indefinite' to bucket '${bucketName}' without retention? ` +
							`The lock rule will apply to all matching objects indefinitely.`,
						result: false,
					});

					await runWrangler(
						`r2 bucket lock add ${bucketName} --name 'rule-not-indefinite' --prefix prefix-not-indefinite`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Add cancelled."
					`);
				});
				it("it should add an age lock rule using command-line arguments and id alias", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-age",
							enabled: true,
							prefix: "prefix-age",
							condition: {
								type: "Age",
								maxAgeSeconds: 86400,
							},
						},
					]);
					// age
					await runWrangler(
						`r2 bucket lock add ${bucketName} --id rule-age --prefix prefix-age --retention-days 1`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lock rule 'rule-age' to bucket 'my-bucket'...
						✨ Added lock rule 'rule-age' to bucket 'my-bucket'."
					`);
				});
				it("it should fail an age lock rule using command-line arguments with invalid age string", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockGetExistingRules(bucketName, []);
					// age
					await expect(() =>
						runWrangler(
							`r2 bucket lock add ${bucketName} --name rule-age --prefix prefix-age --retention-days one`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Days must be a number.]`
					);
				});
				it("it should fail an age lock rule using command-line arguments with invalid negative age", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-age",
							enabled: true,
							prefix: "prefix-age",
							condition: {
								type: "Age",
								maxAgeSeconds: 86400,
							},
						},
					]);
					// age
					await expect(() =>
						runWrangler(
							`r2 bucket lock add ${bucketName} --name rule-age --prefix prefix-age --retention-days -10`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Days must be a positive number: -10]`
					);
				});
				it("it should add a date lock rule using command-line arguments", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-date",
							enabled: true,
							prefix: "prefix-date",
							condition: {
								type: "Date",
								date: "2025-01-30T00:00:00.000Z",
							},
						},
					]);
					// date
					await runWrangler(
						`r2 bucket lock add ${bucketName} --name rule-date --prefix prefix-date --retention-date 2025-01-30`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lock rule 'rule-date' to bucket 'my-bucket'...
						✨ Added lock rule 'rule-date' to bucket 'my-bucket'."
					`);
				});
				it("it should fail to add an invalid date lock rule using command-line arguments if retention is not", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockGetExistingRules(bucketName, []);
					// date
					await expect(() =>
						runWrangler(
							`r2 bucket lock add ${bucketName} --name "rule-date" --prefix "prefix-date" --retention-date "January 30, 2025"`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Date must be a valid date in the YYYY-MM-DD format: January 30, 2025]`
					);
				});
				it("it should add an indefinite lock rule using command-line arguments", async () => {
					setIsTTY(false);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-indefinite",
							enabled: true,
							prefix: "prefix-indefinite",
							condition: {
								type: "Indefinite",
							},
						},
					]);

					await runWrangler(
						`r2 bucket lock add ${bucketName} --name rule-indefinite --prefix prefix-indefinite --retention-indefinite`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Adding lock rule 'rule-indefinite' to bucket 'my-bucket'...
						✨ Added lock rule 'rule-indefinite' to bucket 'my-bucket'."
					`);
				});
				it("it should add an indefinite lock rule using command-line arguments and prompt if not initially specified", async () => {
					setIsTTY(false);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-indefinite",
							enabled: true,
							prefix: "prefix-indefinite",
							condition: {
								type: "Indefinite",
							},
						},
					]);

					mockConfirm({
						text:
							`Are you sure you want to add lock rule 'rule-indefinite' to bucket '${bucketName}' without retention? ` +
							`The lock rule will apply to all matching objects indefinitely.`,
						result: true,
					});

					await runWrangler(
						`r2 bucket lock add ${bucketName} --name rule-indefinite --prefix prefix-indefinite`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						? Are you sure you want to add lock rule 'rule-indefinite' to bucket 'my-bucket' without retention? The lock rule will apply to all matching objects indefinitely.
						🤖 Using fallback value in non-interactive context: yes
						Adding lock rule 'rule-indefinite' to bucket 'my-bucket'...
						✨ Added lock rule 'rule-indefinite' to bucket 'my-bucket'."
					`);
				});
				it("it should fail to add a lock rule if retenion is indefinite but false", async () => {
					setIsTTY(true);
					const bucketName = "my-bucket";

					mockBucketLockPutNew(bucketName, [
						{
							id: "rule-indefinite",
							enabled: true,
							prefix: "prefix-indefinite",
							condition: {
								type: "Indefinite",
							},
						},
					]);

					await expect(() =>
						runWrangler(
							`r2 bucket lock add ${bucketName} --name rule-indefinite --prefix prefix-indefinite --retention-indefinite false`
						)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Retention must be specified.]`
					);
				});
				it("it should fail a lock rule without any command-line arguments", async () => {
					setIsTTY(false);
					const bucketName = "my-bucket";

					mockBucketLockGetExistingRules(bucketName, []);
					// date
					await expect(() =>
						runWrangler(`r2 bucket lock add ${bucketName}`)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						`[Error: Must specify a rule name.]`
					);
				});
			});
			describe("remove", () => {
				it("should remove a lock rule as expected", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const lockRules: BucketLockRule[] = [
						{
							id: ruleId,
							enabled: true,
							prefix: "prefix",
							condition: {
								type: "Indefinite",
							},
						},
					];
					mockBucketLockPutWithExistingRules(bucketName, lockRules, []);
					await runWrangler(
						`r2 bucket lock remove ${bucketName} --name ${ruleId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Removing lock rule 'my-rule' from bucket 'my-bucket'...
						Lock rule 'my-rule' removed from bucket 'my-bucket'."
					`);
				});
				it("should remove a lock rule as expected with id alias", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";
					const lockRules: BucketLockRule[] = [
						{
							id: ruleId,
							enabled: true,
							prefix: "prefix",
							condition: {
								type: "Indefinite",
							},
						},
					];
					mockBucketLockPutWithExistingRules(bucketName, lockRules, []);
					await runWrangler(
						`r2 bucket lock remove ${bucketName} --id ${ruleId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						Removing lock rule 'my-rule' from bucket 'my-bucket'...
						Lock rule 'my-rule' removed from bucket 'my-bucket'."
					`);
				});
				it("should handle removing non-existant rule ID as expected", async () => {
					const bucketName = "my-bucket";
					const ruleId = "my-rule";

					mockBucketLockPutWithExistingRules(bucketName, [], []);
					await expect(() =>
						runWrangler(`r2 bucket lock remove ${bucketName} --name ${ruleId}`)
					).rejects.toThrowErrorMatchingInlineSnapshot(
						"[Error: Lock rule with ID 'my-rule' not found in configuration for 'my-bucket'.]"
					);
				});
			});
			describe("set", () => {
				it("should set lock configuration from a JSON file", async () => {
					setIsTTY(false);
					const bucketName = "my-bucket";
					const filePath = "lock-configuration.json";
					const lockRules = {
						rules: [
							{
								id: "rule-no-prefix-age",
								enabled: true,
								condition: {
									type: "Age",
									maxAgeSeconds: 86400,
								},
							},
							{
								id: "rule-with-prefix-indefinite",
								enabled: true,
								prefix: "prefix",
								condition: {
									type: "Indefinite",
								},
							},
						],
					};

					fs.writeFileSync(filePath, JSON.stringify(lockRules));
					mockConfirm({
						text: `Are you sure you want to overwrite all existing lock rules for bucket '${bucketName}'?`,
						options: { defaultValue: true },
						result: true,
					});

					msw.use(
						http.put(
							"*/accounts/:accountId/r2/buckets/:bucketName/lock",
							async ({ request, params }) => {
								const { accountId, bucketName: bucketParam } = params;
								expect(accountId).toEqual("some-account-id");
								expect(bucketName).toEqual(bucketParam);
								const requestBody = await request.json();
								expect(requestBody).toEqual({
									...lockRules,
								});
								return HttpResponse.json(createFetchResult({}));
							},
							{ once: true }
						)
					);

					await runWrangler(
						`r2 bucket lock set ${bucketName} --file ${filePath}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"
						 ⛅️ wrangler x.x.x
						──────────────────
						? Are you sure you want to overwrite all existing lock rules for bucket 'my-bucket'?
						🤖 Using fallback value in non-interactive context: yes
						Setting lock configuration (2 rules) for bucket 'my-bucket'...
						✨ Set lock configuration for bucket 'my-bucket'."
					`);
				});
			});
		});
	});
});
