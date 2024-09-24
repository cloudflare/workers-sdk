import * as fs from "node:fs";
import { http, HttpResponse } from "msw";
import { MAX_UPLOAD_SIZE } from "../r2/constants";
import { actionsForEventCategories } from "../r2/helpers";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw, mswR2handlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type {
	PutNotificationRequestBody,
	R2BucketInfo,
	R2EventableOperation,
	R2EventType,
} from "../r2/helpers";

describe("r2", () => {
	const std = mockConsoleMethods();
	beforeEach(() => msw.use(...mswR2handlers));

	runInTempDir();

	it("should show help when no argument is passed", async () => {
		await runWrangler("r2");
		await endEventLoop();
		expect(std.out).toMatchInlineSnapshot(`
		"wrangler r2

		📦 Manage R2 buckets & objects

		COMMANDS
		  wrangler r2 object  Manage R2 objects
		  wrangler r2 bucket  Manage R2 buckets

		GLOBAL FLAGS
		  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});

	it("should show help when an invalid argument is passed", async () => {
		await expect(() => runWrangler("r2 asdf")).rejects.toThrow(
			"Unknown argument: asdf"
		);
		await endEventLoop();
		expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown argument: asdf[0m

			"
		`);
		expect(std.out).toMatchInlineSnapshot(`
		"
		wrangler r2

		📦 Manage R2 buckets & objects

		COMMANDS
		  wrangler r2 object  Manage R2 objects
		  wrangler r2 bucket  Manage R2 buckets

		GLOBAL FLAGS
		  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
		  -c, --config                    Path to .toml configuration file  [string]
		  -e, --env                       Environment to use for operations and .env files  [string]
		  -h, --help                      Show help  [boolean]
		  -v, --version                   Show version number  [boolean]"
	`);
	});

	describe("bucket", () => {
		mockAccountId();
		mockApiToken();

		it("should show help when the bucket command is passed", async () => {
			await expect(() => runWrangler("r2 bucket")).rejects.toThrow(
				"Not enough non-option arguments: got 0, need at least 1"
			);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

"`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 bucket

				Manage R2 buckets

				COMMANDS
				  wrangler r2 bucket create <name>  Create a new R2 bucket
				  wrangler r2 bucket update         Update bucket state
				  wrangler r2 bucket list           List R2 buckets
				  wrangler r2 bucket delete <name>  Delete an R2 bucket
				  wrangler r2 bucket sippy          Manage Sippy incremental migration on an R2 bucket
				  wrangler r2 bucket notification   Manage event notification rules for an R2 bucket

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
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
				  wrangler r2 bucket create <name>  Create a new R2 bucket
				  wrangler r2 bucket update         Update bucket state
				  wrangler r2 bucket list           List R2 buckets
				  wrangler r2 bucket delete <name>  Delete an R2 bucket
				  wrangler r2 bucket sippy          Manage Sippy incremental migration on an R2 bucket
				  wrangler r2 bucket notification   Manage event notification rules for an R2 bucket

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});

		describe("list", () => {
			it("should list buckets & check request inputs", async () => {
				const expectedBuckets: R2BucketInfo[] = [
					{ name: "bucket-1-local-once", creation_date: "01-01-2001" },
					{ name: "bucket-2-local-once", creation_date: "01-01-2001" },
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
							);
						},
						{ once: true }
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
					`[Error: Not enough non-option arguments: got 0, need at least 1]`
				);
				expect(std.out).toMatchInlineSnapshot(`
					"
					wrangler r2 bucket create <name>

					Create a new R2 bucket

					POSITIONALS
					  name  The name of the new bucket  [string] [required]

					GLOBAL FLAGS
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
					  -c, --config                    Path to .toml configuration file  [string]
					  -e, --env                       Environment to use for operations and .env files  [string]
					  -h, --help                      Show help  [boolean]
					  -v, --version                   Show version number  [boolean]

					OPTIONS
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]"
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
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
					  -c, --config                    Path to .toml configuration file  [string]
					  -e, --env                       Environment to use for operations and .env files  [string]
					  -h, --help                      Show help  [boolean]
					  -v, --version                   Show version number  [boolean]

					OPTIONS
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]"
				`);
				expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
			});

			it("should create a bucket & check request inputs", async () => {
				msw.use(
					http.post(
						"*/accounts/:accountId/r2/buckets",
						async ({ request, params }) => {
							const { accountId } = params;
							expect(accountId).toEqual("some-account-id");
							expect(await request.json()).toEqual({ name: "testBucket" });
							return HttpResponse.json(createFetchResult({}));
						},
						{ once: true }
					)
				);
				await runWrangler("r2 bucket create testBucket");
				expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket with default storage class set to Standard.
				            Created bucket testBucket with default storage class set to Standard."
			          `);
			});

			it("should create a bucket with the expected jurisdiction", async () => {
				msw.use(
					http.post(
						"*/accounts/:accountId/r2/buckets",
						async ({ request, params }) => {
							const { accountId } = params;
							expect(accountId).toEqual("some-account-id");
							expect(request.headers.get("cf-r2-jurisdiction")).toEqual("eu");
							expect(await request.json()).toEqual({ name: "testBucket" });
							return HttpResponse.json(createFetchResult({}));
						},
						{ once: true }
					)
				);
				await runWrangler("r2 bucket create testBucket -J eu");
				expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket (eu) with default storage class set to Standard.
				            Created bucket testBucket (eu) with default storage class set to Standard."
			          `);
			});

			it("should create a bucket with the expected default storage class", async () => {
				await runWrangler("r2 bucket create testBucket -s InfrequentAccess");
				expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket with default storage class set to InfrequentAccess.
				            Created bucket testBucket with default storage class set to InfrequentAccess."
			          `);
			});

			it("should error if storage class is invalid", async () => {
				await expect(
					runWrangler("r2 bucket create testBucket -s Foo")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[APIError: A request to the Cloudflare API (/accounts/some-account-id/r2/buckets) failed.]`
				);
				expect(std.out).toMatchInlineSnapshot(`
				"Creating bucket testBucket with default storage class set to Foo.

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/r2/buckets) failed.[0m

				  The JSON you provided was not well formed. [code: 10040]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				"
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
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
					  -c, --config                    Path to .toml configuration file  [string]
					  -e, --env                       Environment to use for operations and .env files  [string]
					  -h, --help                      Show help  [boolean]
					  -v, --version                   Show version number  [boolean]"
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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

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
				"Updating bucket testBucket to Foo default storage class.

				[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/some-account-id/r2/buckets/testBucket) failed.[0m

				  The storage class specified is not valid. [code: 10062]

				  If you think this is a bug, please open an issue at:
				  [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m

				"
		`);
				});

				it("should update the default storage class", async () => {
					await runWrangler(
						"r2 bucket update storage-class testBucket -s InfrequentAccess"
					);
					expect(std.out).toMatchInlineSnapshot(`
				            "Updating bucket testBucket to InfrequentAccess default storage class.
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
					wrangler r2 bucket delete <name>

					Delete an R2 bucket

					POSITIONALS
					  name  The name of the bucket to delete  [string] [required]

					GLOBAL FLAGS
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
					  -c, --config                    Path to .toml configuration file  [string]
					  -e, --env                       Environment to use for operations and .env files  [string]
					  -h, --help                      Show help  [boolean]
					  -v, --version                   Show version number  [boolean]

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
					`[Error: The bucket name "abc_def" is invalid. Bucket names can only have alphanumeric and - characters.]`
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
					wrangler r2 bucket delete <name>

					Delete an R2 bucket

					POSITIONALS
					  name  The name of the bucket to delete  [string] [required]

					GLOBAL FLAGS
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
					  -c, --config                    Path to .toml configuration file  [string]
					  -e, --env                       Environment to use for operations and .env files  [string]
					  -h, --help                      Show help  [boolean]
					  -v, --version                   Show version number  [boolean]

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
					  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
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
						`"✨ Successfully enabled Sippy on the 'testBucket' bucket."`
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
						`"✨ Successfully enabled Sippy on the 'testBucket' bucket."`
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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

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
						`"✨ Successfully disabled Sippy on the 'testBucket' bucket."`
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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

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
					`"Sippy configuration: https://storage.googleapis.com/storage/v1/b/testBucket"`
				);
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
				"Fetching notification rules for bucket my-bucket...
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
				"Fetching notification rules for bucket my-bucket...
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

						List event notification rules for a bucket

						POSITIONALS
						  bucket  The name of the R2 bucket to get event notification rules for  [string] [required]

						GLOBAL FLAGS
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]"
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
				"Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

						OPTIONS
						      --event-types, --event-type  The type of event(s) that will emit event notifications  [array] [required] [choices: \\"object-create\\", \\"object-delete\\"]
						      --prefix                     The prefix that an object must match to emit event notifications (note: regular expressions not supported)  [string]
						      --suffix                     The suffix that an object must match to emit event notifications (note: regular expressions not supported)  [string]
						      --queue                      The name of the queue that will receive event notification messages  [string] [required]"
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
				"Deleting event notification rules associated with queue my-queue...
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
				"Deleting event notifications rule \\"rule123456789\\"...
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
						  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
						  -c, --config                    Path to .toml configuration file  [string]
						  -e, --env                       Environment to use for operations and .env files  [string]
						  -h, --help                      Show help  [boolean]
						  -v, --version                   Show version number  [boolean]

						OPTIONS
						      --queue  The name of the queue that corresponds to the event notification rule. If no rule is provided, all event notification rules associated with the bucket and queue will be deleted  [string] [required]
						      --rule   The ID of the event notification rule to delete  [string]"
					`);
				});
			});
		});
	});

	describe("r2 object", () => {
		it("should show help when the object command is passed", async () => {
			await expect(() => runWrangler("r2 object")).rejects.toThrow(
				"Not enough non-option arguments: got 0, need at least 1"
			);
			expect(std.err).toMatchInlineSnapshot(`
				"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

"`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				wrangler r2 object

				Manage R2 objects

				COMMANDS
				  wrangler r2 object get <objectPath>     Fetch an object from an R2 bucket
				  wrangler r2 object put <objectPath>     Create an object in an R2 bucket
				  wrangler r2 object delete <objectPath>  Delete an object in an R2 bucket

				GLOBAL FLAGS
				  -j, --experimental-json-config  Experimental: support wrangler.json  [boolean]
				  -c, --config                    Path to .toml configuration file  [string]
				  -e, --env                       Environment to use for operations and .env files  [string]
				  -h, --help                      Show help  [boolean]
				  -v, --version                   Show version number  [boolean]"
			`);
		});
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

			it("should upload R2 object with storage class to bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png -s InfrequentAccess`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" with InfrequentAccess storage class in bucket \\"bucketName-object-test\\".
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
					[Error: Error: Wrangler only supports uploading files up to 300 MiB in size
					wormhole-img.png is 301 MiB in size]
				`);
			});

			it("should pass all fetch option flags into requestInit & check request inputs", async () => {
				msw.use(
					http.put(
						"*/accounts/:accountId/r2/buckets/:bucketName/objects/:objectName",
						({ request, params }) => {
							const { accountId, bucketName, objectName } = params;
							expect(accountId).toEqual("some-account-id");
							expect(bucketName).toEqual("bucketName-object-test");
							expect(objectName).toEqual("wormhole-img.png");
							const headersObject = Object.fromEntries(
								request.headers.entries()
							);
							delete headersObject["user-agent"];
							//This is removed because jest-fetch-mock does not support ReadableStream request bodies and has an incorrect body and content-length
							delete headersObject["content-length"];
							expect(headersObject).toMatchInlineSnapshot(`
					Object {
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
									bucketName: "bucketName-object-test",
									objectName: "wormhole-img.png",
								})
							);
						},
						{ once: true }
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
					`[Error: Arguments pipe and file are mutually exclusive]`
				);

				expect(std.err).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments pipe and file are mutually exclusive[0m

			"
		`);
			});
		});
	});
});
