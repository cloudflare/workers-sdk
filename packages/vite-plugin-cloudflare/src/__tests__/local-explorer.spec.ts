import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder, createServer, preview } from "vite";
import { afterEach, test, vi } from "vitest";
import type { Plugin } from "vite";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

afterEach(() => vi.unstubAllEnvs());

test.for(
	(["dev", "preview"] as const).flatMap((mode) => [
		{
			mode,
			useViteAllowedHosts: undefined,
			allowedHosts: ["my-app.test", ".example.com"],
		},
		{
			mode,
			useViteAllowedHosts: false,
			allowedHosts: ["my-app.test", ".example.com"],
		},
		{
			mode,
			useViteAllowedHosts: true,
			allowedHosts: ["my-app.test", ".example.com"],
		},
		{ mode, useViteAllowedHosts: true, allowedHosts: true as const },
	])
)(
	"validates Local Explorer origins with %j",
	async ({ mode, allowedHosts, useViteAllowedHosts }, { expect }) => {
		vi.stubEnv("X_LOCAL_EXPLORER", "true");
		const root = mkdtempSync(path.join(fixturesPath, "local-explorer-"));
		writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			`
		import { defineConfig } from "@cloudflare/config";
		export default defineConfig({ worker: {
			name: "local-explorer",
			entrypoint: "./index.ts",
			compatibilityDate: "2024-12-30",
		} });
	`
		);
		writeFileSync(
			path.join(root, "index.ts"),
			`export default { fetch() { return new Response("Hello World!"); } };`
		);
		const config = {
			root,
			configFile: false as const,
			logLevel: "silent" as const,
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					localExplorer:
						useViteAllowedHosts === undefined
							? undefined
							: { useViteAllowedHosts },
				}),
				{
					name: "add-tunnel-host",
					configResolved(resolvedConfig) {
						const serverConfig =
							mode === "dev" ? resolvedConfig.server : resolvedConfig.preview;
						if (serverConfig.allowedHosts !== true) {
							serverConfig.allowedHosts.push("test.trycloudflare.com");
						}
					},
				} satisfies Plugin,
			],
		};
		let server: { close(): Promise<void> } | undefined;
		try {
			let serverUrl: string | undefined;
			if (mode === "dev") {
				const dev = await createServer({
					...config,
					server: {
						allowedHosts: allowedHosts === true ? true : [...allowedHosts],
					},
				});
				server = dev;
				await dev.listen(0);
				serverUrl = dev.resolvedUrls?.local[0];
			} else {
				await (await createBuilder(config)).buildApp();
				const previewServer = await preview({
					...config,
					preview: {
						port: 0,
						allowedHosts: allowedHosts === true ? true : [...allowedHosts],
					},
				});
				server = previewServer;
				serverUrl = previewServer.resolvedUrls?.local[0];
			}
			assert(serverUrl);
			const explorerUrl = new URL("/cdn-cgi/local/explorer/", serverUrl);
			const html = await (await fetch(explorerUrl)).text();
			const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
			assert(assetPath, "Local Explorer HTML should reference a module script");
			const configuredStatus =
				useViteAllowedHosts && allowedHosts !== true ? 200 : 403;
			for (const [hostname, status] of [
				["localhost:8787", 200],
				["my-app.localhost:5173", 200],
				["deep.my-app.localhost", 200],
				["my-app.test", configuredStatus],
				["example.com", configuredStatus],
				["sub.example.com", configuredStatus],
				["deep.sub.example.com", configuredStatus],
				["test.trycloudflare.com", configuredStatus],
				["sub.my-app.test", 403],
				["notexample.com", 403],
				["example.com.evil.com", 403],
				["other.trycloudflare.com", 403],
				["evil.com", 403],
			] as const) {
				for (const pathname of [
					assetPath,
					"/cdn-cgi/local/explorer/api/storage/kv/namespaces",
				]) {
					const response = await fetch(new URL(pathname, serverUrl), {
						headers: { Origin: `https://${hostname}` },
					});
					expect(response.status, `${pathname}: ${hostname}`).toBe(status);
					if (status === 403) {
						expect(await response.text()).toBe("Invalid Origin header");
					} else {
						await response.arrayBuffer();
					}
				}
			}
		} finally {
			await server?.close();
			removeDirSync(root);
		}
	}
);
