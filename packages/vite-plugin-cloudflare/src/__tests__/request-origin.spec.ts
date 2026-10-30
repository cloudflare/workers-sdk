import assert from "node:assert";
import { once } from "node:events";
import * as fs from "node:fs";
import http from "node:http";
import * as path from "node:path";
import { json } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder, createServer, preview } from "vite";
import { test } from "vitest";
import { WebSocket } from "ws";
import type { Plugin } from "vite";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

test.for(["dev", "preview"] as const)(
	"preserves request identity and origin checks in %s",
	async (mode, { expect }) => {
		const root = fs.mkdtempSync(path.join(fixturesPath, "request-origin-"));
		fs.mkdirSync(path.join(root, "public"));
		fs.writeFileSync(
			path.join(root, "public", "index.html"),
			"<p>Static asset</p>"
		);
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			`
			import { defineConfig } from "@cloudflare/config";
			export default defineConfig({ worker: {
				name: "request-origin",
				entrypoint: "./index.ts",
				compatibilityDate: "2024-12-30",
				assets: { runWorkerFirst: ["/note", "/live*", "//attacker.example/*", "///attacker.example:8000/*", "/%2f%5C/*"] },
			} });
		`
		);
		fs.writeFileSync(
			path.join(root, "index.ts"),
			`
			export default {
				fetch(request) {
					const url = new URL(request.url);
					// The same Origin/request.url comparison used by Hono-style CSRF guards.
					if (request.headers.get("Origin") !== url.origin) {
						return new Response("Forbidden", { status: 403 });
					}
					const identity = JSON.stringify({ url: request.url, host: request.headers.get("Host") });
					if (request.headers.get("Upgrade") === "websocket") {
						const [client, server] = Object.values(new WebSocketPair());
						server.accept();
						server.addEventListener("message", () => server.send(identity));
						return new Response(null, { status: 101, webSocket: client });
					}
					return new Response(identity, { headers: { "Content-Type": "application/json" } });
				}
			};
		`
		);
		// Matching static routes must reach the Worker before other Vite middleware.
		const routingSentinel: Plugin = {
			name: "routing-sentinel",
			configureServer(viteServer) {
				viteServer.middlewares.use((req, res, next) => {
					if (req.url?.startsWith("//") || req.url?.startsWith("/\\")) {
						res.statusCode = 418;
						res.end("Static route missed the Worker");
					} else {
						next();
					}
				});
			},
		};
		const config = {
			root,
			configFile: false as const,
			logLevel: "silent" as const,
			plugins: [
				cloudflare({ inspectorPort: false, persistState: false }),
				routingSentinel,
			],
		};
		let server: { close(): Promise<void> } | undefined;
		try {
			let serverUrl: string | undefined;
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
			assert(serverUrl);
			const { origin, host } = new URL(serverUrl);
			const targets = [
				"/note",
				"//attacker.example/only-worker",
				"///attacker.example:8000/only-worker",
				String.raw`/\attacker.example/only-worker`,
				"/%2f%5C/%E2%9C%93?next=//attacker.example&x=+&x=%20&empty=&flag",
			];
			for (const target of targets) {
				for (const requestOrigin of [origin, "http://attacker.example"]) {
					const response = await new Promise<http.IncomingMessage>(
						(resolve, reject) => {
							const request = http.request(
								serverUrl,
								{
									method: "POST",
									path: target,
									headers: {
										Origin: requestOrigin,
										"Content-Type": "application/x-www-form-urlencoded",
									},
								},
								resolve
							);
							request.on("error", reject);
							request.end("text=inert");
						}
					);
					if (requestOrigin === origin) {
						expect(response.statusCode).toBe(200);
						expect(await json(response)).toEqual({
							url: origin + target.replaceAll("\\", "/"),
							host,
						});
					} else {
						response.resume();
						expect(response.statusCode).toBe(403);
					}
				}
			}
			const absoluteResponse = await new Promise<http.IncomingMessage>(
				(resolve, reject) => {
					http
						.get(
							serverUrl,
							{
								path: "http://attacker.example/note",
								headers: { Origin: "http://attacker.example" },
							},
							resolve
						)
						.on("error", reject);
				}
			);
			absoluteResponse.resume();
			expect(absoluteResponse.statusCode).toBe(500);

			for (const target of [
				"/live?token=a%2Fb&token=+",
				"//attacker.example/live",
			]) {
				const client = new WebSocket(
					`${origin.replace("http:", "ws:")}${target}`,
					{ origin }
				);
				try {
					await once(client, "open");
					const received = once(client, "message");
					client.send("identity");
					const [message] = await received;
					expect(JSON.parse(message.toString())).toEqual({
						url: origin + target,
						host,
					});
				} finally {
					client.terminate();
				}
				const foreignClient = new WebSocket(
					`${origin.replace("http:", "ws:")}${target}`,
					{
						origin: "http://attacker.example",
					}
				);
				try {
					await expect(once(foreignClient, "open")).rejects.toThrow(
						"socket hang up"
					);
				} finally {
					foreignClient.terminate();
				}
			}
		} finally {
			await server?.close();
			removeDirSync(root);
		}
	}
);
