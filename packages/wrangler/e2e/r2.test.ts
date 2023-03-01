import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { RUN, makeRoot, noHeader, runIn } from "./util";
import { describe, expect, it } from "vitest";

describe("r2", async () => {
	const root = await makeRoot();
	const bucketName = `wrangler-smoke-test-bucket-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const fileContents = crypto.randomBytes(64).toString("hex");

	it("create bucket", async () => {
		const { stdout, stderr } = await runIn(root)`
    $ ${RUN} r2 bucket create ${bucketName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Creating bucket ${bucketName}.
			Created bucket ${bucketName}."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("create object", async () => {
		await writeFile(path.join(root, "test-r2.txt"), fileContents);
		const { stdout, stderr } = await runIn(root)`
	  $ ${RUN} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Creating object \\"testr2\\" in bucket \\"${bucketName}\\".
			Upload complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("download object", async () => {
		const { stdout, stderr } = await runIn(root)`
	  $ ${RUN} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"${bucketName}\\".
			Download complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const output = await readFile(path.join(root, "test-r2o.txt"), "utf8");
		expect(output).toBe(fileContents);
	});
	it("delete object", async () => {
		const { stdout, stderr } = await runIn(root)`
	  $ ${RUN} r2 object delete ${`${bucketName}/testr2`}
	`;
		expect(stdout).toMatchInlineSnapshot(`
			"Deleting object \\"testr2\\" from bucket \\"${bucketName}\\".
			Delete complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
	it("check object deleted", async () => {
		const { stdout, stderr } = await runIn(root)`
    exits(1) {
	    $ ${RUN} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
    }
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"${bucketName}\\".

			[32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/workers-sdk/issues/new/choose[0m"
		`);
		expect(stderr).toMatchInlineSnapshot(`
			"[31mX [41;31m[[41;97mERROR[41;31m][0m [1mFailed to fetch /accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${bucketName}/objects/testr2 - 404: Not Found);[0m

			"
		`);
	});
	it("delete bucket", async () => {
		const { stdout, stderr } = await runIn(root)`
    $ ${RUN} r2 bucket delete ${bucketName}
    `;
		expect(stdout).toMatchInlineSnapshot(`
			"Deleting bucket ${bucketName}.
			Deleted bucket ${bucketName}."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});
});
