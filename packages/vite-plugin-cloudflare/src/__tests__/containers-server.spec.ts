import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { Miniflare } from "miniflare";
import { createBuilder, createServer, preview } from "vite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { cloudflare } from "../index";
import type { ViteDevServer } from "vite";
import type { TestContext } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	const { fileURLToPath } = await import("node:url");
	const sourceWorkers = fileURLToPath(new URL("../workers/", import.meta.url));
	const builtWorkers = fileURLToPath(
		new URL("../../dist/workers/", import.meta.url)
	);
	return {
		...original,
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

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	const { fileURLToPath } = await import("node:url");
	const sourceWorkers = fileURLToPath(new URL("../workers/", import.meta.url));
	const builtWorkers = fileURLToPath(
		new URL("../../dist/workers/", import.meta.url)
	);
	return {
		...original,
		readFile(file: Parameters<typeof original.readFile>[0], options?: object) {
			if (
				typeof file === "string" &&
				file.startsWith(sourceWorkers) &&
				file.endsWith(".js")
			) {
				file = builtWorkers + file.slice(sourceWorkers.length);
			}
			return original.readFile(file, options);
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

type ContainerScenario = "image-free" | "configured" | "unlinked" | "absent";
const configModuleUrl = import.meta.resolve("@cloudflare/config");

function writeWorkerSource(): void {
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
}

function writeCloudflareConfig(options: {
	scenario: ContainerScenario;
	remoteImage?: boolean;
}): void {
	const hasContainer = options.scenario !== "absent";
	const isLinked = !["unlinked", "absent"].includes(options.scenario);
	const hasImage = options.scenario === "configured";
	const image = options.remoteImage
		? "image: { reference: 'docker.io/cloudflare/test:latest' },"
		: "image: { dockerfile: './Dockerfile' },";
	fs.writeFileSync(
		"cloudflare.config.ts",
		[
			`import { defineConfig, defineContainer, exports as workerExports } from '${configModuleUrl}';`,
			hasContainer
				? `const probe = defineContainer({ name: 'probe', ${hasImage ? image : "schedulingPolicy: 'durable-object',"} });`
				: "",
			"export default defineConfig({",
			`  containers: ${hasContainer ? "[probe]" : "[]"},`,
			"  worker: {",
			"    name: 'container-test',",
			"    entrypoint: './index.js',",
			"    compatibilityDate: '2026-09-21',",
			`    exports: { Probe: workerExports.durableObject({ storage: 'sqlite'${isLinked ? ", container: probe" : ""} }) },`,
			"  },",
			"});",
		].join("\n")
	);
}

/**
 * Writes a `vite.config.mjs` that loads this module's `cloudflare` through
 * the bridge that {@link startDevServerFromConfigFile} creates, so a server
 * restarted from the file shares the test's plugin state.
 *
 * @param includeCloudflare - Whether the config includes the Cloudflare plugin.
 */
function writeViteConfig(includeCloudflare: boolean): void {
	fs.writeFileSync(
		"vite.config.mjs",
		includeCloudflare
			? `
import { createRequire } from "node:module";
const { cloudflare } = createRequire(import.meta.url)("./factory.cjs");
export default { plugins: [cloudflare({ inspectorPort: false, persistState: false, remoteBindings: false, types: { generate: false } })] };
`
			: "export default { plugins: [] };\n"
	);
}

/**
 * Starts a dev server from a `vite.config.mjs` that includes the Cloudflare
 * plugin, so that `server.restart()` reloads the file. The server doesn't
 * watch files, so it restarts only when the test calls `server.restart()`.
 *
 * @param onTestFinished - The test's `onTestFinished`, which closes the server.
 * @returns The listening server.
 */
async function startDevServerFromConfigFile(
	onTestFinished: TestContext["onTestFinished"]
): Promise<ViteDevServer> {
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
	writeViteConfig(true);
	const server = await createServer({
		configFile: path.resolve("vite.config.mjs"),
		logLevel: "silent",
		server: { port: 0, watch: null },
	});
	onTestFinished(() => server.close());
	await server.listen();
	return server;
}

describe.each(["dev", "preview"] as const)(
	"Container preparation in Vite %s",
	(mode) => {
		runInTempDir();

		beforeEach(async () => {
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
			test.for(["configured", "absent"] as const)(
				"keeps dependency optimizer hashes stable on the first restart with Containers %s",
				async (scenario, { expect, onTestFinished }) => {
					writeWorkerSource();
					writeCloudflareConfig({ scenario });
					const server = await startDevServerFromConfigFile(onTestFinished);
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
			test("disposes Miniflare once when overlapping restarts remove the Cloudflare plugin", async ({
				expect,
				onTestFinished,
			}) => {
				writeWorkerSource();
				writeCloudflareConfig({ scenario: "configured" });
				const dispose = vi.spyOn(Miniflare.prototype, "dispose");
				const server = await startDevServerFromConfigFile(onTestFinished);

				await server.restart();
				expect(dispose).not.toHaveBeenCalled();

				writeViteConfig(false);
				// Overlapping restarts, such as a config watcher restart and a manual
				// one, share Vite's restart promise, so both find the plugin removed.
				await Promise.all([server.restart(), server.restart()]);
				expect(dispose).toHaveBeenCalledOnce();
			});
			test("uses distinct image tags for same-class Containers in different Workers", async ({
				expect,
				onTestFinished,
			}) => {
				writeWorkerSource();
				writeCloudflareConfig({ scenario: "configured" });
				const server = await createServer({
					configFile: false,
					logLevel: "silent",
					plugins: [
						cloudflare({
							inspectorPort: false,
							persistState: false,
							remoteBindings: false,
							types: { generate: false },
							auxiliaryWorkers: [
								{
									config: {
										name: "auxiliary-container-test",
										entrypoint: "./index.js",
										compatibilityDate: "2026-09-21",
										exports: {
											Probe: {
												type: "durable-object",
												storage: "sqlite",
												container: "probe",
											},
										},
									},
								},
							],
						}),
					],
				});
				onTestFinished(() => server.close());

				const options = vi.mocked(prepareContainerImagesForDev).mock
					.calls[0]?.[0].containerOptions;
				expect(options).toHaveLength(2);
				expect(options?.map(({ class_name }) => class_name)).toEqual([
					"Probe",
					"Probe",
				]);
				expect(new Set(options?.map(({ image_tag }) => image_tag)).size).toBe(
					2
				);
			});
		}

		test.for(["image-free", "configured", "unlinked", "absent"] as const)(
			"prepares only linked Containers: %s",
			async (scenario, { expect, onTestFinished }) => {
				writeWorkerSource();
				writeCloudflareConfig({
					scenario,
					remoteImage: mode === "preview",
				});
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
								types: { generate: false },
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

				if (scenario === "unlinked" || scenario === "absent") {
					expect(prepareContainerImagesForDev).not.toHaveBeenCalled();
				} else {
					expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(1);
					const options = vi.mocked(prepareContainerImagesForDev).mock
						.calls[0]?.[0].containerOptions;
					expect(options).toHaveLength(scenario === "configured" ? 1 : 0);
				}
			}
		);
	}
);
