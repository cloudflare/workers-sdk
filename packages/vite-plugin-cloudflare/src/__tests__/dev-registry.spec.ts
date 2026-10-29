import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { onTestFinished, test, vi } from "vitest";

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "dev-registry");

test.for(["default", "relative override", "absolute override"])(
	"connects Vite to native Miniflare using the registry %s",
	async (kind, { expect }) => {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		onTestFinished(() => removeDirSync(root));
		onTestFinished(() => {
			vi.unstubAllEnvs();
		});

		const configDir = path.join(root, "config");
		const registryPath =
			kind === "default"
				? path.join(configDir, "cloudflare", "dev-registry", "v5")
				: path.join(root, "registry");
		vi.stubEnv("XDG_CONFIG_HOME", configDir);
		vi.stubEnv(
			"CLOUDFLARE_DEV_REGISTRY_PATH",
			kind === "default"
				? undefined
				: kind === "relative override"
					? path.relative(process.cwd(), registryPath)
					: registryPath
		);
		vi.stubEnv("MINIFLARE_REGISTRY_PATH", path.join(root, "legacy-miniflare"));
		vi.stubEnv("WRANGLER_REGISTRY_PATH", path.join(root, "legacy-wrangler"));

		// The Vite plugin shares one Miniflare across servers in a process, so use
		// a separate native instance as the discovery peer.
		const target = new Miniflare({
			workers: [
				{
					config: {
						name: "registry-target",
						compatibilityDate: "2024-12-30",
						manifest: {
							mainModule: "index.mjs",
							modules: {
								"index.mjs": {
									type: "esm",
									contents:
										"export default { fetch() { return new Response('registry target'); } };",
								},
							},
						},
					},
				},
			],
		});
		onTestFinished(() => target.dispose());
		await target.ready;
		fs.writeFileSync(
			path.join(root, "index.ts"),
			"export default { fetch(request, env) { return env.SERVICE.fetch(request); } };"
		);
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({
					config: (loadedConfig) => ({
						...loadedConfig,
						worker: {
							...loadedConfig.worker,
							name: "registry-client",
							entrypoint: "./index.ts",
							compatibilityDate: "2024-12-30",
							env: { SERVICE: { type: "worker", worker: "registry-target" } },
						},
					}),
					inspectorPort: false,
					persistState: false,
					types: { generate: false },
				}),
			],
		});
		onTestFinished(() => server.close());
		await server.listen(0);
		const clientUrl = server.resolvedUrls?.local[0];
		assert(clientUrl, "Expected the server URL to be defined");
		expect(fs.readdirSync(registryPath)).toEqual(
			expect.arrayContaining(["registry-client", "registry-target"])
		);

		await vi.waitFor(
			async () => {
				const response = await fetch(clientUrl);
				expect(await response.text()).toBe("registry target");
				expect(response.status).toBe(200);
			},
			{ timeout: 10_000 }
		);
	}
);
