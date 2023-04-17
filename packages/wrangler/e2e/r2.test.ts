import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RUN, runIn } from "./helpers/run";
import { makeRoot, seed } from "./helpers/setup";

describe("r2", async () => {
	const root = await makeRoot();
	const bucketName = `wrangler-smoke-test-bucket-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const fileContents = crypto.randomBytes(64).toString("hex");

	it("create bucket", async () => {
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
    $ ${RUN} r2 bucket create ${bucketName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Creating bucket wrangler-smoke-test-bucket.
			Created bucket wrangler-smoke-test-bucket."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("create object", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
	  $ ${RUN} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Creating object \\"testr2\\" in bucket \\"wrangler-smoke-test-bucket\\".
			Upload complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("download object", async () => {
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
	  $ ${RUN} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"wrangler-smoke-test-bucket\\".
			Download complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const output = await readFile(path.join(root, "test-r2o.txt"), "utf8");
		expect(output).toBe(fileContents);
	});
	it("delete object", async () => {
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
	  $ ${RUN} r2 object delete ${`${bucketName}/testr2`}
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Deleting object \\"testr2\\" from bucket \\"wrangler-smoke-test-bucket\\".
			Delete complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("check object deleted", async () => {
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
			[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
		})`
    exits(1) {
	    $ ${RUN} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
    }
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"wrangler-smoke-test-bucket\\".

			If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
		expect(stderr).toMatchInlineSnapshot(`
			"X [ERROR] Failed to fetch /accounts/CLOUDFLARE_ACCOUNT_ID/r2/buckets/wrangler-smoke-test-bucket/objects/testr2 - 404: Not Found);

			"
		`);
	});
	it("delete bucket", async () => {
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
    $ ${RUN} r2 bucket delete ${bucketName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Deleting bucket wrangler-smoke-test-bucket.
			Deleted bucket wrangler-smoke-test-bucket."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("check bucket deleted", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await runIn(root, {
			[bucketName]: "wrangler-smoke-test-bucket",
		})`
		exits(1) {
	  	$ ${RUN} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
		}
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Creating object \\"testr2\\" in bucket \\"wrangler-smoke-test-bucket\\".

			If you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose"
		`);
		expect(stderr).toMatchInlineSnapshot(`
			"X [ERROR] Failed to fetch /accounts/c1813c2bcbf20b513d80d455cb110774/r2/buckets/wrangler-smoke-test-bucket/objects/testr2 - 404: Not Found);

			"
		`);
	});
});
