import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect } from "vitest";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

describe("r2", () => {
	let bucketName: string;
	let fileContents: string;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		bucketName = generateResourceName("r2");
		normalize = (str) =>
			normalizeOutput(str, {
				[bucketName]: "tmp-e2e-r2",
				[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
			});
		fileContents = crypto.randomBytes(64).toString("hex");
	});

	e2eTest("create bucket", async ({ run }) => {
		const output = await run(`wrangler r2 bucket create ${bucketName}`);

		expect(normalize(output)).toMatchInlineSnapshot(`
			"Creating bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000 with default storage class set to Standard.
			Created bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000 with default storage class set to Standard."
		`);
	});

	e2eTest("create object", async ({ seed, run }) => {
		await seed({
			"test-r2.txt": fileContents,
		});
		const output = await run(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html`
		);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Creating object "testr2" in bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Upload complete."
		`);
	});

	e2eTest("download object", async ({ run, tmpPath }) => {
		const output = await run(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt`
		);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Downloading "testr2" from "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Download complete."
		`);
		const file = await readFile(path.join(tmpPath, "test-r2o.txt"), "utf8");
		expect(file).toBe(fileContents);
	});
	e2eTest("delete object", async ({ run }) => {
		const output = await run(`wrangler r2 object delete ${bucketName}/testr2`);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Deleting object "testr2" from bucket "tmp-e2e-r2-00000000-0000-0000-0000-000000000000".
			Delete complete."
		`);
	});

	e2eTest("check object deleted", async ({ run }) => {
		const { readUntil } = run(
			`wrangler r2 object get ${bucketName}/testr2 --file test-r2o.txt`
		);
		await readUntil(/The specified key does not exist/);
	});

	e2eTest("delete bucket", async ({ run }) => {
		const output = await run(`wrangler r2 bucket delete ${bucketName}`);
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Deleting bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000.
			Deleted bucket tmp-e2e-r2-00000000-0000-0000-0000-000000000000."
		`);
	});

	e2eTest("check bucket deleted", async ({ run, seed }) => {
		await seed({
			"test-r2.txt": fileContents,
		});
		const { readUntil } = run(
			`wrangler r2 object put ${bucketName}/testr2 --file test-r2.txt --content-type text/html`
		);
		await readUntil(/The specified bucket does not exist/);
	});
});
