import { execSync } from "child_process";
import * as nodeNet from "node:net";
import dedent from "ts-dedent";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER_IMPORT } from "./helpers/wrangler";

describe("getPlatformProxy()", () => {
	// TODO(DEVX-1262): re-enable when we have set an API token with the proper AI permissions
	describe.skip("Workers AI", () => {
		let root: string;
		beforeEach(async () => {
			root = makeRoot();

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
						import { getPlatformProxy } from "${WRANGLER_IMPORT}"

						const { env } = await getPlatformProxy();
						const messages = [
							{
								role: "user",
								// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
								content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
							},
						];

						const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
							messages,
						});

						console.log(content.response);

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
		it("can run ai inference", async () => {
			const stdout = execSync(`node index.mjs`, {
				cwd: root,
				encoding: "utf-8",
			});
			expect(stdout).toContain("Workers AI");
		});
	});

	describe("Hyperdrive", () => {
		let root: string;
		let port = 5432;
		let server: nodeNet.Server;

		beforeEach(async () => {
			server = nodeNet.createServer().listen();

			if (server.address() && typeof server.address() !== "string") {
				port = (server.address() as nodeNet.AddressInfo).port;
			}

			root = makeRoot();

			await seed(root, {
				"wrangler.toml": dedent`
						name = "hyperdrive-app"
						compatibility_date = "2024-08-20"
						compatibility_flags = ["nodejs_compat"]

						[[hyperdrive]]
						binding = "HYPERDRIVE"
						id = "hyperdrive_id"
						localConnectionString = "postgresql://user:%21pass@127.0.0.1:${port}/some_db"
				`,
				"index.mjs": dedent/*javascript*/ `
						import { getPlatformProxy } from "${WRANGLER_IMPORT}";

						const { env, dispose } = await getPlatformProxy();

						const conn = env.HYPERDRIVE.connect();
						await conn.writable.getWriter().write(new TextEncoder().encode("test string sent using getPlatformProxy"));

						await dispose();
						`,
				"package.json": dedent`
						{
							"name": "hyperdrive-app",
							"version": "0.0.0",
							"private": true
						}
						`,
			});
		});

		it.skipIf(
			// in CI this test fails for windows because of ECONNRESET issues
			process.platform === "win32"
		)(
			"can connect to a TCP socket via the hyperdrive connect method",
			async () => {
				const socketDataMsgPromise = new Promise<string>((resolve, _) => {
					server.on("connection", (sock) => {
						sock.on("data", (data) => {
							resolve(new TextDecoder().decode(data));
							server.close();
						});
					});
				});

				execSync("node index.mjs", {
					cwd: root,
					encoding: "utf-8",
				});
				expect(await socketDataMsgPromise).toMatchInlineSnapshot(
					`"test string sent using getPlatformProxy"`
				);
			}
		);
	});
});
