import assert from "node:assert";
import * as fs from "node:fs";
import http from "node:http";
import * as path from "node:path";
import { json } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder, createServer, preview } from "vite";
import { afterAll, beforeAll, describe, test } from "vitest";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

/**
 * Sends a request with Node's `http` client, which adds no Fetch headers of
 * its own, the way curl or a server-to-server call reaches the dev server.
 *
 * @param serverUrl The Vite server's URL
 * @param headers The only headers the client sends, besides Node's defaults
 * @returns The request headers the Worker received
 */
function sendRawRequest(
	serverUrl: string,
	headers: http.OutgoingHttpHeaders = {}
): Promise<Record<string, string>> {
	return new Promise((resolve, reject) => {
		const request = http.request(
			serverUrl,
			{
				method: "POST",
				path: "/x",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					...headers,
				},
			},
			(response) => {
				json(response).then(
					(body) => resolve(body as Record<string, string>),
					reject
				);
			}
		);
		request.on("error", reject);
		request.end("a");
	});
}

describe.for(["dev", "preview"] as const)(
	"request headers forwarded to the Worker in %s",
	(mode) => {
		let root: string | undefined;
		let server: { close(): Promise<void> } | undefined;
		let serverUrl: string | undefined;

		beforeAll(async () => {
			root = fs.mkdtempSync(path.join(fixturesPath, "request-headers-"));
			fs.writeFileSync(
				path.join(root, "cloudflare.config.ts"),
				`
				import { defineConfig } from "@cloudflare/config";
				export default defineConfig({ worker: {
					name: "request-headers",
					entrypoint: "./index.ts",
					compatibilityDate: "2024-12-30",
				} });
			`
			);
			fs.writeFileSync(
				path.join(root, "index.ts"),
				`
				export default {
					fetch(request) {
						return Response.json(Object.fromEntries(request.headers));
					}
				};
			`
			);
			const config = {
				root,
				configFile: false as const,
				logLevel: "silent" as const,
				plugins: [cloudflare({ inspectorPort: false, persistState: false })],
			};
			if (mode === "dev") {
				const dev = await createServer(config);
				server = dev;
				await dev.listen(0);
				serverUrl = dev.resolvedUrls?.local[0];
			} else {
				await (await createBuilder(config)).buildApp();
				const previewServer = await preview({
					...config,
					preview: { port: 0 },
				});
				server = previewServer;
				serverUrl = previewServer.resolvedUrls?.local[0];
			}
		});

		afterAll(async () => {
			await server?.close();
			if (root) {
				removeDirSync(root);
			}
		});

		test("does not add `Sec-Fetch-Mode` when the client sent none", async ({
			expect,
		}) => {
			assert(serverUrl);
			const headers = await sendRawRequest(serverUrl);
			expect(headers).not.toHaveProperty("sec-fetch-mode");
		});

		test("does not add `Accept-Language` when the client sent none", async ({
			expect,
		}) => {
			assert(serverUrl);
			const headers = await sendRawRequest(serverUrl);
			expect(headers).not.toHaveProperty("accept-language");
		});

		test("passes through `Sec-Fetch-Mode` and `Accept-Language` the client sent", async ({
			expect,
		}) => {
			assert(serverUrl);
			const headers = await sendRawRequest(serverUrl, {
				"Sec-Fetch-Mode": "navigate",
				"Accept-Language": "en-GB",
			});
			expect(headers).toMatchObject({
				"sec-fetch-mode": "navigate",
				"accept-language": "en-GB",
			});
		});
	}
);
