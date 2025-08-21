import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("r2", () => {
	const bucketName = generateResourceName("r2");
	const fileContents = crypto.randomBytes(64).toString("hex");
	const normalize = (str: string) =>
		normalizeOutput(str, {
			[bucketName]: "tmp-e2e-r2",
			...(process.env.CLOUDFLARE_ACCOUNT_ID
				? {
						[process.env.CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
					}
				: {}),
		});
	const helper = new WranglerE2ETestHelper();

	it("create bucket", async () => {
		const output = await helper.run(`wrangler r2 bucket create ${bucketName}`);

		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Creating bucket 'tmp-e2e-r2-00000000-0000-0000-0000-000000000000'...
			✅ Created bucket 'tmp-e2e-r2-00000000-0000-0000-0000-000000000000' with default storage class of Standard.
			To access your new R2 Bucket in your Worker, add the following snippet to your configuration file:
			{
			  "r2_buckets": [
			    {
			      "bucket_name": "tmp-e2e-r2-00000000-0000-0000-0000-000000000000",
			      "binding": "tmp_e2e_r2_00000000_0000_0000_0000_000000000000"
			    }
			  ]
			}"
		`);
	});

	it("create object", async () => {
		await helper.seed({
			"test-r2.txt": fileContents,
		});
		const output = await helper.run(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html --remote`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Resource location: remote
			Creating object "testr2" in bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Upload complete."
		`);
	});

	it("download object", async () => {
		const output = await helper.run(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt --remote`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Resource location: remote
			Downloading "testr2" from "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Download complete."
		`);
		const file = await readFile(
			path.join(helper.tmpPath, "test-r2o.txt"),
			"utf8"
		);
		expect(file).toBe(fileContents);
	});

	it("delete object", async () => {
		const output = await helper.run(
			`wrangler r2 object delete ${bucketName}/testr2 --remote`
		);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Resource location: remote
			Deleting object "testr2" from bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Delete complete."
		`);
	});

	it("check object deleted", async () => {
		const output = await helper.run(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt --remote`
		);
		expect(output.stderr).toContain("The specified key does not exist");
	});

	it("delete bucket", async () => {
		const output = await helper.run(`wrangler r2 bucket delete ${bucketName}`);
		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			"Deleting bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000.
			Deleted bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000."
		`);
	});

	it("check bucket deleted", async () => {
		await helper.seed({
			"test-r2.txt": fileContents,
		});
		const output = await helper.run(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html --remote`
		);
		expect(output.stderr).toContain("The specified bucket does not exist");
	});
});
