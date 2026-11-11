import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { Miniflare } from "miniflare";
import { createBuilder, createServer, preview } from "vite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { cloudflare } from "../index";

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	const { fileURLToPath } = await import("node:url");
	const sourceWorkers = fileURLToPath(new URL("../workers/", import.meta.url));
	const builtWorkers = fileURLToPath(
		new URL("../../dist/workers/", import.meta.url)
	);
	return {
		...original,
		// Source imports resolve bundled Workers under src; read their real build
		// outputs from dist so dev exercises the same Workers as the published plugin.
		readFileSync(
			file: Parameters<typeof original.readFileSync>[0],
			options: Parameters<typeof original.readFileSync>[1]
		) {
			if (
				typeof file === "string" &&
				file.startsWith(sourceWorkers) &&
				file.endsWith(".js")
			) {
				file = builtWorkers + file.slice(sourceWorkers.length);
			}
			return original.readFileSync(file, options);
		},
	};
});

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@cloudflare/containers-shared")>();
	return {
		...original,
		prepareContainerImagesForDev: vi.fn(async () => ({ aborted: false })),
	};
});

describe.each(["dev", "preview"] as const)(
	"Container preparation in Vite %s",
	(mode) => {
		runInTempDir();

		beforeEach(async () => {
			// Vite rejects Windows 8.3 paths such as RUNNER~1. Unlike the
			// synchronous helper, fs.promises.realpath expands these short names.
			const root = await fs.promises.realpath(process.cwd());
			process.chdir(root);
			vi.stubEnv("PWD", root);
			vi.stubEnv("WRANGLER_DOCKER_HOST", "unix:///test/docker.sock");
			vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
			vi.mocked(prepareContainerImagesForDev).mockClear();
		});

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		if (mode === "dev") {
			test("disposes Miniflare once when overlapping restarts remove the Cloudflare plugin", async ({
				expect,
				onTestFinished,
			}) => {
				fs.writeFileSync(
					"index.js",
					`import { DurableObject } from "cloudflare:workers";
export class Probe extends DurableObject {}
export default { fetch() { return new Response("ready"); } };`
				);
				fs.writeFileSync("Dockerfile", "FROM alpine:3.19\n");
				fs.writeFileSync("package.json", JSON.stringify({ type: "module" }));
				fs.writeFileSync(
					"wrangler.jsonc",
					JSON.stringify({
						name: "container-cleanup-plugin-removal-test",
						main: "index.js",
						compatibility_date: "2026-09-21",
						containers: [
							{
								class_name: "Probe",
								scheduling_policy: "durable_object",
								images: { app: { dockerfile: "./Dockerfile" } },
							},
						],
						durable_objects: {
							bindings: [{ name: "PROBE", class_name: "Probe" }],
						},
						migrations: [{ tag: "v1", new_sqlite_classes: ["Probe"] }],
					})
				);
				const require = createRequire(import.meta.url);
				const bridgePath = path.resolve("factory.cjs");
				fs.writeFileSync(bridgePath, "module.exports = {};\n");
				const bridge = require(bridgePath) as {
					cloudflare: typeof cloudflare;
					includeCloudflare: boolean;
				};
				bridge.cloudflare = cloudflare;
				bridge.includeCloudflare = true;
				onTestFinished(() => {
					delete require.cache[bridgePath];
				});
				fs.writeFileSync(
					"vite.config.mjs",
					`
import { createRequire } from "node:module";
const bridge = createRequire(import.meta.url)("./factory.cjs");
export default {
  plugins: bridge.includeCloudflare
    ? [bridge.cloudflare({ inspectorPort: false, persistState: false, remoteBindings: false })]
    : [],
};
`
				);
				const dispose = vi.spyOn(Miniflare.prototype, "dispose");
				onTestFinished(() => dispose.mockRestore());
				const server = await createServer({
					configFile: path.resolve("vite.config.mjs"),
					logLevel: "silent",
					server: { port: 0, watch: null },
				});
				onTestFinished(() => server.close());
				await server.listen();
				await server.restart();
				expect(dispose).not.toHaveBeenCalled();
				bridge.includeCloudflare = false;
				await Promise.all([server.restart(), server.restart()]);
				expect(dispose).toHaveBeenCalledOnce();
				await server.close();
				expect(dispose).toHaveBeenCalledOnce();
			});
			test.for(["configured", "absent"] as const)(
				"keeps dependency optimizer hashes stable on the first restart with Containers %s",
				async (scenario, { expect, onTestFinished }) => {
					fs.writeFileSync(
						"index.js",
						`import { DurableObject } from "cloudflare:workers";
export class Probe extends DurableObject {}
export default { fetch() { return new Response("ready"); } };`
					);
					fs.writeFileSync("Dockerfile", "FROM alpine:3.19\n");
					fs.writeFileSync("package.json", JSON.stringify({ type: "module" }));
					fs.writeFileSync(
						"wrangler.jsonc",
						JSON.stringify({
							name: "container-restart-hash-test",
							main: "index.js",
							compatibility_date: "2026-09-21",
							...(scenario === "configured"
								? {
										containers: [
											{
												class_name: "Probe",
												scheduling_policy: "durable_object",
												images: { app: { dockerfile: "./Dockerfile" } },
											},
										],
									}
								: {}),
							durable_objects: {
								bindings: [{ name: "PROBE", class_name: "Probe" }],
							},
							migrations: [{ tag: "v1", new_sqlite_classes: ["Probe"] }],
						})
					);
					const require = createRequire(import.meta.url);
					const bridgePath = path.resolve("factory.cjs");
					fs.writeFileSync(bridgePath, "module.exports = {};\n");
					const bridge = require(bridgePath) as {
						cloudflare: typeof cloudflare;
					};
					bridge.cloudflare = cloudflare;
					onTestFinished(() => {
						delete require.cache[bridgePath];
					});
					fs.writeFileSync(
						"vite.config.mjs",
						`
import { createRequire } from "node:module";
const { cloudflare } = createRequire(import.meta.url)("./factory.cjs");
export default { plugins: [cloudflare({ inspectorPort: false, persistState: false, remoteBindings: false })] };
`
					);
					const server = await createServer({
						configFile: path.resolve("vite.config.mjs"),
						logLevel: "silent",
						server: { port: 0 },
					});
					onTestFinished(() => server.close());
					await server.listen();
					const configHashes = () =>
						Object.fromEntries(
							Object.entries(server.environments)
								.filter(([_, environment]) => environment.depsOptimizer)
								.map(([name, environment]) => [
									name,
									environment.depsOptimizer?.metadata.configHash,
								])
						);
					const initialHashes = configHashes();
					expect(Object.keys(initialHashes)).toContain("client");
					await server.restart();
					expect(configHashes()).toEqual(initialHashes);
				}
			);
		}

		test("uses inline configuration guidance without inventing a config file", async ({
			expect,
			onTestFinished,
		}) => {
			fs.writeFileSync("package.json", JSON.stringify({ type: "module" }));
			fs.writeFileSync("Dockerfile", "FROM alpine:3.19\n");
			fs.writeFileSync(
				"index.js",
				`import { DurableObject } from "cloudflare:workers";
export class Probe extends DurableObject {}
export default { fetch() { return new Response("ready"); } };`
			);
			function config() {
				return {
					root: process.cwd(),
					configFile: false as const,
					logLevel: "silent" as const,
					server: { port: 0 },
					preview: { port: 0 },
					plugins: [
						cloudflare({
							inspectorPort: false,
							persistState: false,
							remoteBindings: false,
							config: {
								name: "inline-container-test",
								main: path.resolve("index.js"),
								compatibility_date: "2026-10-19",
								containers: [
									{
										class_name: "Probe",
										scheduling_policy: "durable_object",
										images: { app: { dockerfile: path.resolve("Dockerfile") } },
									},
								],
								durable_objects: {
									bindings: [{ name: "PROBE", class_name: "Probe" }],
								},
								migrations: [{ tag: "v1", new_sqlite_classes: ["Probe"] }],
							},
						}),
					],
				};
			}
			if (mode === "preview") {
				const builder = await createBuilder(config());
				await builder.buildApp();
			}
			const server = await (mode === "dev"
				? createServer(config())
				: preview(config()));
			onTestFinished(() => server.close());
			expect(prepareContainerImagesForDev).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					configFileName:
						mode === "dev" ? "Vite plugin configuration" : "wrangler.json",
				})
			);
		});

		test.for(["image-free", "configured", "disabled", "absent"] as const)(
			"prepares only enabled Containers: %s",
			async (scenario, { expect, onTestFinished }) => {
				fs.writeFileSync(
					"index.js",
					`
				import { DurableObject } from "cloudflare:workers";
				export class Probe extends DurableObject {}
				export default { fetch() { return new Response("ready"); } };
			`
				);
				fs.writeFileSync("Dockerfile", "FROM alpine:3.19\n");
				fs.writeFileSync("package.json", JSON.stringify({ type: "module" }));
				fs.writeFileSync(
					"wrangler.jsonc",
					JSON.stringify({
						name: "container-test",
						main: "index.js",
						compatibility_date: "2026-09-21",
						dev: { enable_containers: scenario !== "disabled" },
						containers:
							scenario === "absent"
								? []
								: [
										{
											class_name: "Probe",
											scheduling_policy: "durable_object",
											...(scenario === "configured"
												? {
														images: {
															app: { dockerfile: "./Dockerfile" },
														},
													}
												: {}),
										},
									],
						durable_objects: {
							bindings: [{ name: "PROBE", class_name: "Probe" }],
						},
						migrations: [{ tag: "v1", new_sqlite_classes: ["Probe"] }],
					})
				);
				function config() {
					return {
						root: process.cwd(),
						configFile: false as const,
						logLevel: "silent" as const,
						server: { port: 0 },
						preview: { port: 0 },
						plugins: [
							cloudflare({
								configPath: path.resolve("wrangler.jsonc"),
								inspectorPort: false,
								persistState: false,
								remoteBindings: false,
							}),
						],
					};
				}
				async function startServer() {
					if (mode === "preview") {
						const builder = await createBuilder(config());
						await builder.buildApp();
					}
					const server = await (mode === "dev"
						? createServer(config())
						: preview(config()));
					onTestFinished(() => server.close());
					return server;
				}
				const server = await startServer();

				if (scenario === "disabled" || scenario === "absent") {
					expect(prepareContainerImagesForDev).not.toHaveBeenCalled();
				} else {
					expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(1);
					expect(prepareContainerImagesForDev).toHaveBeenCalledWith(
						expect.objectContaining({
							configFileName:
								mode === "dev" ? "wrangler.jsonc" : "wrangler.json",
							registryConfigureCommand:
								"wrangler containers registries configure",
						})
					);
					const options = vi.mocked(prepareContainerImagesForDev).mock
						.calls[0]?.[0].containerOptions;
					expect(options).toHaveLength(scenario === "configured" ? 1 : 0);
				}

				const dispose = vi.spyOn(Miniflare.prototype, "dispose");
				onTestFinished(() => dispose.mockRestore());
				await server.close();
				expect(dispose).toHaveBeenCalledOnce();
			}
		);
	}
);
