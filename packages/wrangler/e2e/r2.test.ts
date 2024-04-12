import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import shellac from "shellac";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler";

describe("r2", () => {
	let root: string;
	let bucketName: string;
	let fileContents: string;
	let run: typeof shellac;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		root = await makeRoot();
		bucketName = `wrangler-smoke-test-bucket-${crypto
			.randomBytes(4)
			.toString("hex")}`;
		run = shellac.in(root).env(process.env);
		normalize = (str) =>
			normalizeOutput(str, {
				[bucketName]: "wrangler-smoke-test-bucket",
				[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
			});
		fileContents = crypto.randomBytes(64).toString("hex");
	});

	it("create bucket", async () => {
		const { stdout } = await run`$ ${WRANGLER} r2 bucket create ${bucketName}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating bucket wrangler-smoke-test-bucket with default storage class set to Standard.
			Created bucket wrangler-smoke-test-bucket with default storage class set to Standard."
		`);
	});

	it("create object", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await run`
			$ ${WRANGLER} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating object "testr2" in bucket "wrangler-smoke-test-bucket".
			Upload complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("download object", async () => {
		const { stdout, stderr } = await run`
			$ ${WRANGLER} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Downloading "testr2" from "wrangler-smoke-test-bucket".
			Download complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const output = await readFile(path.join(root, "test-r2o.txt"), "utf8");
		expect(output).toBe(fileContents);
	});
	it("delete object", async () => {
		const { stdout, stderr } =
			await run`$ ${WRANGLER} r2 object delete ${`${bucketName}/testr2`}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Deleting object "testr2" from bucket "wrangler-smoke-test-bucket".
			Delete complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("check object deleted", async () => {
		const { stdout, stderr } = await run`
    	exits(1) {
				$ ${WRANGLER} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
			}
    `;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Downloading "testr2" from "wrangler-smoke-test-bucket"."
		`);
		expect(normalize(stderr)).toMatchInlineSnapshot(`
			"X [ERROR] The specified key does not exist.
			🪵  Logs were written to "<LOG>""
		`);
	});

	it("delete bucket", async () => {
		const { stdout, stderr } =
			await run`$ ${WRANGLER} r2 bucket delete ${bucketName}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Deleting bucket wrangler-smoke-test-bucket.
			Deleted bucket wrangler-smoke-test-bucket."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("check bucket deleted", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await run`
			exits(1) {
				$ ${WRANGLER} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
			}
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating object "testr2" in bucket "wrangler-smoke-test-bucket"."
		`);
		expect(normalize(stderr)).toMatchInlineSnapshot(`
			"X [ERROR] The specified bucket does not exist.
			🪵  Logs were written to "<LOG>""
		`);
	});
});
