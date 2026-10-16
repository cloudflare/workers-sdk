import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { test } from "vitest";
import { startPublishedWrangler } from "./helpers/published-wrangler";

test.for([false, true])(
	"reports rollback success only when changed secrets are accepted (%s)",
	async (acceptSecrets, { expect, onTestFinished }) => {
		const root = await mkdtemp(join(tmpdir(), "vite-v1-rollback-"));
		onTestFinished(() => removeDir(root));
		await writeFile(
			join(root, "wrangler.json"),
			JSON.stringify({ name: "rollback-test", account_id: "test-account" })
		);
		const deployments: (string | null)[] = [];
		const unexpected: string[] = [];
		const server = createServer((request, response) => {
			request.resume();
			const url = new URL(request.url ?? "/", "http://localhost");
			let result: unknown;
			if (request.method === "GET" && url.pathname.endsWith("/deployments")) {
				result = {
					deployments: [
						{
							id: "current-deployment",
							created_on: "2026-10-15T00:00:00Z",
							source: "api",
							strategy: "percentage",
							versions: [{ version_id: "current-version", percentage: 100 }],
						},
					],
				};
			} else if (
				request.method === "GET" &&
				url.pathname.includes("/versions/")
			) {
				result = {
					id: url.pathname.split("/").at(-1),
					number: 1,
					metadata: {},
					resources: { bindings: [], script: { handlers: ["fetch"] } },
				};
			} else if (
				request.method === "POST" &&
				url.pathname.endsWith("/deployments")
			) {
				const force = url.searchParams.get("force");
				deployments.push(force);
				if (force !== "true") {
					response.writeHead(400, { "Content-Type": "application/json" });
					response.end(
						JSON.stringify({
							success: false,
							errors: [
								{
									code: 10220,
									message:
										"The following secrets have changed: SECRET_ONE, SECRET_TWO",
								},
							],
						})
					);
					return;
				}
				result = {};
			} else {
				unexpected.push(`${request.method} ${url.pathname}`);
				response.writeHead(404);
				response.end();
				return;
			}
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({ success: true, errors: [], messages: [], result })
			);
		});
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		onTestFinished(() => {
			server.closeAllConnections();
			return new Promise<void>((resolve) => server.close(() => resolve()));
		});
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("Expected a TCP address");
		}
		const wrangler = startPublishedWrangler(
			["rollback", "rollback-version"],
			root,
			{
				CLOUDFLARE_API_TOKEN: "test-token",
				CLOUDFLARE_API_BASE_URL: `http://127.0.0.1:${address.port}`,
			}
		);
		await wrangler.waitForOutput("Please provide an optional message");
		wrangler.child.stdin.write("\r");
		await wrangler.waitForOutput("Are you sure you want to deploy");
		wrangler.child.stdin.write("y\r");
		await wrangler.waitForOutput("Please confirm you wish to continue");
		wrangler.child.stdin.end(acceptSecrets ? "y\r" : "n\r");
		await wrangler.closed;

		expect(wrangler.child.exitCode, wrangler.output).toBe(0);
		expect(unexpected).toEqual([]);
		expect(deployments).toEqual(acceptSecrets ? [null, "true"] : [null]);
		if (acceptSecrets) {
			expect(wrangler.output).toContain("has been deployed to 100% of traffic");
			expect(wrangler.output).toContain("Current Version ID: rollback-version");
		} else {
			expect(wrangler.output).toContain("Aborting rollback");
			expect(wrangler.output).not.toContain(
				"has been deployed to 100% of traffic"
			);
			expect(wrangler.output).not.toContain("Current Version ID:");
		}
	}
);
