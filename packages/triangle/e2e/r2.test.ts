import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import shellac from "shellac";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";
import { TRIANGLE } from "./helpers/triangle-command";

describe("r2", () => {
	let root: string;
	let bucketName: string;
	let fileContents: string;
	let run: typeof shellac;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		root = await makeRoot();
		bucketName = `triangle-smoke-test-bucket-${crypto
			.randomBytes(4)
			.toString("hex")}`;
		run = shellac.in(root).env(process.env);
		normalize = (str) =>
			normalizeOutput(str, {
				[bucketName]: "triangle-smoke-test-bucket",
				[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
			});
		fileContents = crypto.randomBytes(64).toString("hex");
	});

	it("create bucket", async () => {
		const { stdout } = await run`$ ${TRIANGLE} r2 bucket create ${bucketName}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating bucket triangle-smoke-test-bucket.
			Created bucket triangle-smoke-test-bucket."
		`);
	});

	it("create object", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await run`
			$ ${TRIANGLE} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating object \\"testr2\\" in bucket \\"triangle-smoke-test-bucket\\".
			Upload complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("download object", async () => {
		const { stdout, stderr } = await run`
			$ ${TRIANGLE} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"triangle-smoke-test-bucket\\".
			Download complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const output = await readFile(path.join(root, "test-r2o.txt"), "utf8");
		expect(output).toBe(fileContents);
	});
	it("delete object", async () => {
		const { stdout, stderr } =
			await run`$ ${TRIANGLE} r2 object delete ${`${bucketName}/testr2`}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Deleting object \\"testr2\\" from bucket \\"triangle-smoke-test-bucket\\".
			Delete complete."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("check object deleted", async () => {
		const { stdout, stderr } = await run`
    	exits(1) {
				$ ${TRIANGLE} r2 object get ${`${bucketName}/testr2`} --file test-r2o.txt
			}
    `;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Downloading \\"testr2\\" from \\"triangle-smoke-test-bucket\\".
			If you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose"
		`);
		expect(normalize(stderr)).toMatchInlineSnapshot(`
			"X [ERROR] Failed to fetch /accounts/CLOUDFLARE_ACCOUNT_ID/r2/buckets/triangle-smoke-test-bucket/objects/testr2 - 404: Not Found);
			"
		`);
	});

	it("delete bucket", async () => {
		const { stdout, stderr } =
			await run`$ ${TRIANGLE} r2 bucket delete ${bucketName}`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Deleting bucket triangle-smoke-test-bucket.
			Deleted bucket triangle-smoke-test-bucket."
		`);
		expect(stderr).toMatchInlineSnapshot('""');
	});

	it("check bucket deleted", async () => {
		await seed(root, {
			"test-r2.txt": fileContents,
		});
		const { stdout, stderr } = await run`
			exits(1) {
				$ ${TRIANGLE} r2 object put ${`${bucketName}/testr2`} --file test-r2.txt --content-type text/html
			}
		`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Creating object \\"testr2\\" in bucket \\"triangle-smoke-test-bucket\\".
			If you think this is a bug then please create an issue at https://github.com/khulnasoft/workers-sdk/issues/new/choose"
		`);
		expect(normalize(stderr)).toMatchInlineSnapshot(`
			"X [ERROR] Failed to fetch /accounts/CLOUDFLARE_ACCOUNT_ID/r2/buckets/triangle-smoke-test-bucket/objects/testr2 - 404: Not Found);
			"
		`);
	});
});
