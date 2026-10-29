import path from "node:path";
import { createConnection } from "mysql2/promise";
import pg from "pg";
import { fetch } from "undici";
import { describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";
import type { Hyperdrive } from "@cloudflare/workers-types";

const { getPlatformProxy } = await importWrangler();

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("remote Hyperdrive consumers", () => {
	it.for(["mysql", "postgresql"] as const)(
		"authenticates and queries through Wrangler and getPlatformProxy (%s)",
		async (scheme, { expect }) => {
			const helper = new WranglerE2ETestHelper();
			const { id } = await helper.hyperdrive(false, scheme);
			const driver = scheme === "mysql" ? "mysql2/promise" : "pg";
			const scriptPath =
				scheme === "mysql"
					? "hyperdrive-query.js"
					: "hyperdrive-postgres-query.js";
			await helper.seed(path.resolve(__dirname, "./workers"));
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: generateResourceName("hyperdrive-query"),
					main: scriptPath,
					compatibility_date: "2026-09-01",
					compatibility_flags: ["nodejs_compat"],
					alias: { [driver]: require.resolve(driver) },
					hyperdrive: [
						{
							binding: "HYPERDRIVE_BINDING",
							id,
							remote: true,
							localConnectionString: "unused-invalid-local",
						},
					],
				}),
			});
			const worker = helper.runLongLived("wrangler dev");
			try {
				const { url } = await worker.waitForReady();
				await Promise.all(
					Array.from({ length: 3 }, async () => {
						const response = await fetch(url);
						expect(response.status).toBe(200);
						expect(await response.json()).toEqual([
							{ remote_hyperdrive_probe: 1 },
						]);
					})
				);
				const platform = await getPlatformProxy<{
					HYPERDRIVE_BINDING: Hyperdrive;
				}>({
					configPath: path.join(helper.tmpPath, "wrangler.json"),
					remoteBindings: true,
				});
				try {
					const binding = platform.env.HYPERDRIVE_BINDING;
					const connectionOptions = {
						host: binding.host,
						port: binding.port,
						user: binding.user,
						password: binding.password,
						database: binding.database,
					};
					if (scheme === "mysql") {
						const connection = await createConnection(connectionOptions);
						try {
							const [rows] = await connection.query(
								"SELECT 1 AS remote_hyperdrive_probe"
							);
							expect(rows).toEqual([{ remote_hyperdrive_probe: 1 }]);
						} finally {
							await connection.end();
						}
					} else {
						const client = new pg.Client(connectionOptions);
						try {
							await client.connect();
							const { rows } = await client.query(
								"SELECT 1 AS remote_hyperdrive_probe"
							);
							expect(rows).toEqual([{ remote_hyperdrive_probe: 1 }]);
						} finally {
							await client.end();
						}
					}
				} finally {
					await platform.dispose();
				}
			} finally {
				await worker.stop();
			}
		}
	);
});
