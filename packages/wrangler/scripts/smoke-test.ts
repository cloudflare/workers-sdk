import assert from "assert";
import crypto from "crypto";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { $, cd, chalk, fetch } from "zx";
const root = await mkdtemp(path.join(os.tmpdir(), "wrangler-smoke-"));
assert(
	process.env.CLOUDFLARE_ACCOUNT_ID,
	"Please provide a CLOUDFLARE_ACCOUNT_ID as an environment variable"
);
cd(root);
const workerName = `test-worker-${crypto.randomBytes(8).toString("hex")}`;
const init = await $`npx -y wrangler@beta init ${workerName}`;
assert(init.stdout.includes(`✨ Created ${workerName}/src/index.test.ts`));
cd(`./${workerName}`);

// Publish worker
const publish = await $`npx wrangler publish`;
const url = publish.stdout.match(/https:\/\/(.*)workers\.dev/)?.[0];
assert(url, "Deployed worker URL not found");
await $`sleep 2`;
let resp = await fetch(url);
assert((await resp.text()) === "Hello World!", "Worker not reachable");

// Delete worker
const del = await $`CI=true npx wrangler delete`;
assert(
	del.stdout.includes("Successfully deleted"),
	"Couldn't delete test worker"
);
await $`sleep 2`;
resp = await fetch(url);
assert(
	(await resp.text()) !== "Hello World!",
	"Worker is reachable after delete"
);
// R2
const bucketName = `test-bucket-${crypto.randomBytes(8).toString("hex")}`;
await $`npx wrangler r2 bucket create ${bucketName}`;
const list = await $`npx wrangler r2 bucket list`;
assert(list.stdout.includes(bucketName), "Bucket not created");

await $`echo testr2 > testr2.txt`;
await $`npx wrangler r2 object put ${`${bucketName}/testr2`} --file testr2.txt --content-type text/html`;
await $`npx wrangler r2 object get ${`${bucketName}/testr2`} --file testr2o.txt`;
assert(
	(await $`diff testr2.txt testr2o.txt`).stdout === "",
	"Downloaded file didn't match uploaded file"
);
await $`npx wrangler r2 object delete ${`${bucketName}/testr2`}`;
try {
	await $`npx wrangler r2 object get ${`${bucketName}/testr2`} --file testr2o.txt`;
	assert(false, "File not deleted");
} catch (e) {}

await $`npx wrangler r2 bucket delete ${bucketName}`;
const delList = await $`npx wrangler r2 bucket list`;
assert(!delList.stdout.includes(bucketName), "Bucket not deleted");
console.log(chalk.green(chalk.bgWhite("Successfully smoke tested!!")));
