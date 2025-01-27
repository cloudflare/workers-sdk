import * as fs from "node:fs";
import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { MAX_UPLOAD_SIZE } from "../r2/constants";
import { actionsForEventCategories } from "../r2/helpers";
import { endEventLoop } from "./helpers/end-event-loop";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockConfirm } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createFetchResult, msw, mswR2handlers } from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type {
	PutNotificationRequestBody,
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
			  -c, --config   Path to Wrangler configuration file  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
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
			  -c, --config   Path to Wrangler configuration file  [string]
			  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			  -h, --help     Show help  [boolean]
			  -v, --version  Show version number  [boolean]"
		`);
	});

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
				  wrangler r2 bucket notification     Manage event notification rules for an R2 bucket
				  wrangler r2 bucket domain           Manage custom domains for an R2 bucket
				  wrangler r2 bucket dev-url          Manage public access via the r2.dev URL for an R2 bucket
				  wrangler r2 bucket lifecycle        Manage lifecycle rules for an R2 bucket
				  wrangler r2 bucket cors             Manage CORS configuration for an R2 bucket

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
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
				  wrangler r2 bucket notification     Manage event notification rules for an R2 bucket
				  wrangler r2 bucket domain           Manage custom domains for an R2 bucket
				  wrangler r2 bucket dev-url          Manage public access via the r2.dev URL for an R2 bucket
				  wrangler r2 bucket lifecycle        Manage lifecycle rules for an R2 bucket
				  wrangler r2 bucket cors             Manage CORS configuration for an R2 bucket

				GLOBAL FLAGS
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
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
					"Listing buckets...
					name:           bucket-1-local-once
					creation_date:  01-01-2001

					name:           bucket-2-local-once
					creation_date:  01-01-2001"
				  `);
			});
		});

		describe("info", () => {
			it("should get information for the given bucket", async () => {
				const bucketName = "my-bucket";
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
				await runWrangler(`r2 bucket info ${bucketName}`);
				expect(std.out).toMatchInlineSnapshot(`
						"Getting info for 'my-bucket'...
						name:                   my-bucket
						created:                01-01-2001
						location:               WNAM
						default_storage_class:  Standard
						object_count:           0
						bucket_size:            0 B"
					  `);
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
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

					OPTIONS
					      --location       The optional location hint that determines geographic placement of the R2 bucket  [string] [choices: \\"weur\\", \\"eeur\\", \\"apac\\", \\"wnam\\", \\"enam\\", \\"oc\\"]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]"
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
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

					OPTIONS
					      --location       The optional location hint that determines geographic placement of the R2 bucket  [string] [choices: \\"weur\\", \\"eeur\\", \\"apac\\", \\"wnam\\", \\"enam\\", \\"oc\\"]
					  -s, --storage-class  The default storage class for objects uploaded to this bucket  [string]
					  -J, --jurisdiction   The jurisdiction where the new bucket will be created  [string]"
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
				expect(std.out).toMatchInlineSnapshot(`
					"Creating bucket 'test-bucket'...

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
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
					wrangler r2 bucket delete <bucket>

					Delete an R2 bucket

					POSITIONALS
					  bucket  The name of the bucket to delete  [string] [required]

					GLOBAL FLAGS
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

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
					`[Error: The bucket name "abc_def" is invalid. Bucket names must begin and end with an alphanumeric and can only contain letters (a-z), numbers (0-9), and hyphens (-).]`
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
					`[Error: The bucket name "abc-" is invalid. Bucket names must begin and end with an alphanumeric and can only contain letters (a-z), numbers (0-9), and hyphens (-).]`
				);
			});

			it("should error if the bucket name is over 63 characters", async () => {
				await expect(
					runWrangler("r2 bucket create " + "a".repeat(64))
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The bucket name "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" is invalid. Bucket names must begin and end with an alphanumeric and can only contain letters (a-z), numbers (0-9), and hyphens (-).]`
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
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]

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
					  -c, --config   Path to Wrangler configuration file  [string]
					  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
					  -h, --help     Show help  [boolean]
					  -v, --version  Show version number  [boolean]"
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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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

						List event notification rules for an R2 bucket

						POSITIONALS
						  bucket  The name of the R2 bucket to get event notification rules for  [string] [required]

						GLOBAL FLAGS
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
				"Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
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
				"Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
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
				"Creating event notification rule for object creation and deletion (PutObject,CompleteMultipartUpload,CopyObject,DeleteObject,LifecycleDeletion)
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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
						  -c, --config   Path to Wrangler configuration file  [string]
						  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
						  -h, --help     Show help  [boolean]
						  -v, --version  Show version number  [boolean]

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
						"Retrieving custom domain 'test.com' connected to bucket 'my-bucket'...
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
						"Connecting custom domain 'example.com' to bucket 'my-bucket'...
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
						"Listing custom domains connected to bucket 'my-bucket'...
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
						"Removing custom domain 'example.com' from bucket 'my-bucket'...
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
						"Updating custom domain 'example.com' for bucket 'my-bucket'...
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
						"Public access is enabled at 'https://pub-bucket-id-123.r2.dev'."
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
						"Public access via the r2.dev URL is disabled."
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
						"Enabling public access for bucket 'my-bucket'...
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
						"Disabling public access for bucket 'my-bucket'...
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
					"Listing lifecycle rules for bucket 'my-bucket'...
					id:       rule-1
					enabled:  Yes
					prefix:   images/
					action:   Expire objects after 30 days"
				  `);
				});
			});
			describe("add", () => {
				it("it should add a lifecycle rule using command-line arguments", async () => {
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
						`r2 bucket lifecycle add ${bucketName} --id ${ruleId} --prefix ${prefix} --expire-days ${conditionValue}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"Adding lifecycle rule 'my-rule' to bucket 'my-bucket'...
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
						`r2 bucket lifecycle remove ${bucketName} --id ${ruleId}`
					);
					expect(std.out).toMatchInlineSnapshot(`
						"Removing lifecycle rule 'my-rule' from bucket 'my-bucket'...
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
							`r2 bucket lifecycle remove ${bucketName} --id ${ruleId}`
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

					writeFileSync(filePath, JSON.stringify(lifecycleRules));

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
						"Setting lifecycle configuration (1 rules) for bucket 'my-bucket'...
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
					"Listing CORS rules for bucket 'my-bucket'...
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

					writeFileSync(filePath, JSON.stringify(corsRules));

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
						"Setting CORS configuration (1 rules) for bucket 'my-bucket'...
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
						"Deleting the CORS configuration for bucket 'my-bucket'...
						CORS configuration deleted for bucket 'my-bucket'."
					  `);
				});
			});
		});
	});

	describe("r2 object", () => {
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
				  -c, --config   Path to Wrangler configuration file  [string]
				  -e, --env      Environment to use for operations, and for selecting .env and .dev.vars files  [string]
				  -h, --help     Show help  [boolean]
				  -v, --version  Show version number  [boolean]"
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
