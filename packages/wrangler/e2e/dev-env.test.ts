import { execSync } from "child_process";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER_IMPORT } from "./helpers/wrangler";

describe("switching runtimes", () => {
	let root: string;
	beforeEach(async () => {
		root = await makeRoot();

		await seed(root, {
			"wrangler.toml": dedent`
					name = "dev-env-app"
					account_id = "${CLOUDFLARE_ACCOUNT_ID}"
					compatibility_date = "2023-01-01"
			`,
			"index.mjs": dedent/*javascript*/ `
					const firstRemote = process.argv[2] === "remote"
					import { unstable_DevEnv as DevEnv } from "${WRANGLER_IMPORT}";

					const devEnv = new DevEnv()

					let config = {
						name: "worker",
						script: "",
						compatibilityFlags: ["nodejs_compat"],
						compatibilityDate: "2023-10-01",
						dev: {
							remote: firstRemote,
							auth: {
								accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
								apiToken: process.env.CLOUDFLARE_API_TOKEN
							}
						}
					};
					let bundle = {
						type: "esm",
						modules: [],
						id: 0,
						path: "/virtual/esm/index.mjs",
						entrypointSource: "export default { fetch() { return new Response('Hello World " + (firstRemote ? 'local' : 'remote') + " runtime') } }",
						entry: {
							file: "esm/index.mjs",
							directory: "/virtual/",
							format: "modules",
							moduleRoot: "/virtual",
							name: undefined,
						},
						dependencies: {},
						sourceMapPath: undefined,
						sourceMapMetadata: undefined,
					};

					devEnv.proxy.onConfigUpdate({
						type: "configUpdate",
						config,
					});

					devEnv.runtimes.forEach((runtime) =>
						runtime.onBundleStart({
							type: "bundleStart",
							config,
						})
					);

					devEnv.runtimes.forEach((runtime) =>
						runtime.onBundleComplete({
							type: "bundleComplete",
							config,
							bundle,
						})
					);

					// Immediately switch runtime
					config = { ...config, dev: { ...config.dev, remote: !firstRemote } };
					bundle = {...bundle, entrypointSource: "export default { fetch() { return new Response('Hello World " + (firstRemote ? 'local' : 'remote') + " runtime') } }"}

					devEnv.proxy.onConfigUpdate({
						type: "configUpdate",
						config,
					});

					devEnv.runtimes.forEach((runtime) =>
						runtime.onBundleStart({
							type: "bundleStart",
							config,
						})
					);

					devEnv.runtimes.forEach((runtime) =>
						runtime.onBundleComplete({
							type: "bundleComplete",
							config,
							bundle,
						})
					);

					const { proxyWorker } = await devEnv.proxy.ready.promise;
					await devEnv.proxy.runtimeMessageMutex.drained();

					console.log(await proxyWorker.dispatchFetch("http://example.com").then(r => r.text()))

					process.exit(0);
					`,
			"package.json": dedent`
					{
						"name": "ai-app",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
	});
	it("can switch from local to remote, with first fetch returning remote", async () => {
		const stdout = execSync(`node index.mjs local`, {
			timeout: 20_000,
			encoding: "utf-8",
			cwd: root,
			stdio: "pipe",
		});
		expect(stdout).toContain("Hello World remote runtime");
	});
	it("can switch from remote to local, with first fetch returning local", async () => {
		const stdout = execSync(`node index.mjs remote`, {
			timeout: 20_000,
			encoding: "utf-8",
			cwd: root,
			stdio: "pipe",
		});
		expect(stdout).toContain("Hello World local runtime");
	});
});
