import shellac from "shellac";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER_IMPORT } from "./helpers/wrangler";

// TODO(DEVX-1262): re-enable when we have set an API token with the proper AI permissions
describe("switching runtimes", () => {
	let run: typeof shellac;
	beforeEach(async () => {
		const root = await makeRoot();

		run = shellac.in(root).env(process.env);
		await seed(root, {
			"wrangler.toml": dedent`
					name = "ai-app"
					account_id = "${CLOUDFLARE_ACCOUNT_ID}"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["nodejs_compat"]

					[ai]
					binding = "AI"
			`,
			"index.mjs": dedent/*javascript*/ `
					const firstRemote = process.argv[2] === "remote"
					import { unstable_DevEnv as DevEnv } from "${WRANGLER_IMPORT}";

					const devEnv = new DevEnv()

					const config = {
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
					const bundle = {
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
					config.dev.remote = !firstRemote
					bundle.entrypointSource = "export default { fetch() { return new Response('Hello World " + (firstRemote ? 'local' : 'remote') + " runtime') } }"

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
		const { stdout } = await run`$ node index.mjs local`;
		expect(stdout).toContain("Hello World remote runtime");
	});
	it("can switch from remote to local, with first fetch returning local", async () => {
		const { stdout } = await run`$ node index.mjs remote`;
		expect(stdout).toContain("Hello World local runtime");
	});
});
