import { execSync } from "child_process";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER_IMPORT } from "./helpers/wrangler";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("switching runtimes", () => {
	let root: string;
	beforeEach(async () => {
		root = await makeRoot();

		await seed(root, {
			"wrangler.toml": dedent`
					name = "dev-env-app"
					account_id = "${CLOUDFLARE_ACCOUNT_ID}"
					compatibility_date = "2023-01-01"
			`,
			"index.ts": dedent/*javascript*/ `
				export default {
					async fetch(request, env) {
						return new Response(
							env.ORDER + ": I am " + (env.REMOTE ? "remote" : "local")
						);
					},
				};
			`,
			"index.mjs": dedent/*javascript*/ `
				import { setTimeout } from "timers/promises";
				import { unstable_startWorker as startWorker } from "${WRANGLER_IMPORT}";

				const firstRemote = process.argv[2] === "remote";

                let worker;
                try {
                    worker = await startWorker({
                        name: "worker",
                        entrypoint: "index.ts",
                        compatibilityFlags: ["nodejs_compat"],
                        compatibilityDate: "2023-10-01",
                        bindings: {
                            REMOTE: {
                                type: "json",
                                value: firstRemote,
                            },
                            ORDER: {
                                type: "plain_text",
                                value: "1",
                            },
                        },
                        dev: {
                            remote: firstRemote,
                            auth: {
                                accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
                                apiToken: {
                                    apiToken: process.env.CLOUDFLARE_API_TOKEN,
                                }
                            },
                            server: {
                                port: 0,
                            },
                        },
                    });

                    const url = await worker.url;
                    console.log(await fetch(url).then((r) => r.text()));

                    await worker.patchConfig({
                        bindings: {
                            REMOTE: {
                                type: "json",
                                value: !firstRemote,
                            },
                            ORDER: {
                                type: "plain_text",
                                value: "2",
                            },
                        },
                        dev: {
                            ...worker.config.dev,
                            remote: !firstRemote,
                        },
                    });

                    // Give the config some time to propagate
                    await setTimeout(500);

                    console.log(await fetch(url).then((r) => r.text()));
                } finally {
                    await worker?.dispose();
                    process.exit(0);
                }
            `,
			"package.json": dedent`
                {
                    "name": "dev-env-app",
                    "version": "0.0.0",
                    "private": true
                }
            `,
		});
	});
	it("can switch from local to remote", async () => {
		const stdout = execSync(`node index.mjs local`, {
			timeout: 20_000,
			encoding: "utf-8",
			cwd: root,
			stdio: "pipe",
		});
		expect(stdout).toContain("1: I am local");
		expect(stdout).toContain("2: I am remote");
	});
	it("can switch from remote to local", async () => {
		const stdout = execSync(`node index.mjs remote`, {
			timeout: 20_000,
			encoding: "utf-8",
			cwd: root,
			stdio: "pipe",
		});
		expect(stdout).toContain("1: I am remote");
		expect(stdout).toContain("2: I am local");
	});
});
