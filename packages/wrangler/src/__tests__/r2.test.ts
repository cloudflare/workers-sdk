import * as fs from "node:fs";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const std = mockConsoleMethods();

	describe("r2", () => {
		describe("bucket", () => {
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

			          Flags:
			            -c, --config   Path to .toml configuration file  [string]
			            -h, --help     Show help  [boolean]
			            -v, --version  Show version number  [boolean]"
		        `);
			});

			describe("list", () => {
				it("should list buckets", async () => {
					await runWrangler("r2 bucket list");

					expect(std.err).toMatchInlineSnapshot(`""`);
					expect(std.out).toMatchInlineSnapshot(`
				"[
				  {
				    \\"name\\": \\"bucket-1\\",
				    \\"creation_date\\": \\"01-01-2001\\"
				  },
				  {
				    \\"name\\": \\"bucket-2\\",
				    \\"creation_date\\": \\"01-01-2001\\"
				  }
				]"
			`);
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

				            Flags:
				              -c, --config   Path to .toml configuration file  [string]
				              -h, --help     Show help  [boolean]
				              -v, --version  Show version number  [boolean]"
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

				            Flags:
				              -c, --config   Path to .toml configuration file  [string]
				              -h, --help     Show help  [boolean]
				              -v, --version  Show version number  [boolean]"
			          `);
					expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
				});

				it("should create a bucket", async () => {
					await runWrangler("r2 bucket create testBucket");
					expect(std.out).toMatchInlineSnapshot(`
				            "Creating bucket testBucket.
				            Created bucket testBucket."
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

				            Flags:
				              -c, --config   Path to .toml configuration file  [string]
				              -h, --help     Show help  [boolean]
				              -v, --version  Show version number  [boolean]"
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

				            Flags:
				              -c, --config   Path to .toml configuration file  [string]
				              -h, --help     Show help  [boolean]
				              -v, --version  Show version number  [boolean]"
			          `);
					expect(std.err).toMatchInlineSnapshot(`
				            "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

				            "
			          `);
				});

				it("should delete a bucket specified by name", async () => {
					await runWrangler(`r2 bucket delete some-bucket`);

					expect(std.out).toMatchInlineSnapshot(`
				"Deleting bucket some-bucket.
				Deleted bucket some-bucket."
			`);
				});
			});
		});

		describe("r2 object", () => {
			it("should download R2 object from bucket", async () => {
				await runWrangler(
					`r2 object get bucketName-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Downloading \\"wormhole-img.png\\" from \\"bucketName-object-test\\".
			Download complete."
		`);
			});

			it("should upload R2 object from bucket", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				await runWrangler(
					`r2 object put bucketName-object-test/wormhole-img.png --file ./wormhole-img.png`
				);

				expect(std.out).toMatchInlineSnapshot(`
			"Creating object \\"wormhole-img.png\\" in bucket \\"bucketName-object-test\\".
			Upload complete."
		`);
			});

			it("should pass all fetch option flags into requestInit", async () => {
				fs.writeFileSync("wormhole-img.png", "passageway");
				const flags =
					"--ct content-type --cd content-disposition --ce content-encoding --cl content-lang --cc cache-control --e expire-time";

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
