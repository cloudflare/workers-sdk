import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
	cleanupContainers,
	prepareContainerImagesForDev,
} from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
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
		cleanupContainers: vi.fn(),
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
			vi.mocked(cleanupContainers).mockReset().mockReturnValue(true);
		});

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		if (mode === "dev") {
			test.for(["inline", "config-file"] as const)(
				"retries failed cleanup across %s restarts without mixing servers",
				async (configuration, { expect, onTestFinished }) => {
					writeWorkerSource();
					writeCloudflareConfig({ scenario: "configured" });
					if (configuration === "config-file") {
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
								export default { plugins: [cloudflare({ inspectorPort: false, persistState: false, remoteBindings: false, types: { generate: false } })] };
							`
						);
					}
					const initialExitListeners = new Set(process.listeners("exit"));
					const options = {
						configFile:
							configuration === "inline"
								? (false as const)
								: path.resolve("vite.config.mjs"),
						logLevel: "silent" as const,
						server: { port: 0 },
						plugins:
							configuration === "inline"
								? [
										cloudflare({
											inspectorPort: false,
											persistState: false,
											remoteBindings: false,
											types: { generate: false },
										}),
									]
								: [],
					};
					const server = await createServer(options);
					onTestFinished(() => server.close());
					expect(server.config.inlineConfig).toBe(options);
					const containerExitListeners = () =>
						process
							.listeners("exit")
							.filter(
								(listener) =>
									!initialExitListeners.has(listener) &&
									listener.name === "cleanupContainerImages"
							);
					const latestTags = () =>
						new Set(
							vi
								.mocked(prepareContainerImagesForDev)
								.mock.calls.at(-1)?.[0]
								.containerOptions.map(({ image_tag }) => image_tag)
						);
					let pendingTags = latestTags();
					const exitListener = containerExitListeners()[0];
					expect(exitListener).toBeDefined();
					const secondServer = await createServer(options);
					onTestFinished(() => secondServer.close());
					expect(secondServer.config.inlineConfig).toBe(options);
					const secondTags = latestTags();
					const listeners = containerExitListeners();
					expect(listeners).toHaveLength(2);
					await server.listen();
					for (let restart = 0; restart < 2; restart++) {
						const previousPlugin = server.config.plugins.find(
							(plugin) => plugin.name === "vite-plugin-cloudflare:dev"
						);
						vi.mocked(cleanupContainers).mockReturnValueOnce(false);
						await server.restart();
						expect(cleanupContainers).toHaveBeenLastCalledWith(
							expect.any(String),
							pendingTags
						);
						expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(
							restart + 3
						);
						const currentPlugin = server.config.plugins.find(
							(plugin) => plugin.name === "vite-plugin-cloudflare:dev"
						);
						if (configuration === "config-file") {
							expect(currentPlugin).not.toBe(previousPlugin);
						} else {
							expect(currentPlugin).toBe(previousPlugin);
						}
						expect(server.config.inlineConfig).toBe(options);
						pendingTags = new Set([...pendingTags, ...latestTags()]);
						expect(pendingTags.size).toBe(restart + 2);
						expect(new Set(containerExitListeners())).toEqual(
							new Set(listeners)
						);
					}
					await server.restart();
					expect(cleanupContainers).toHaveBeenLastCalledWith(
						expect.any(String),
						pendingTags
					);
					expect(new Set(containerExitListeners())).toEqual(new Set(listeners));
					const currentTags = latestTags();
					exitListener?.(0);
					expect(cleanupContainers).toHaveBeenLastCalledWith(
						expect.any(String),
						currentTags
					);
					expect(containerExitListeners()).toHaveLength(1);
					await server.close();
					expect(cleanupContainers).toHaveBeenCalledTimes(4);
					await secondServer.close();
					expect(cleanupContainers).toHaveBeenLastCalledWith(
						expect.any(String),
						secondTags
					);
					expect(cleanupContainers).toHaveBeenCalledTimes(5);
					expect(containerExitListeners()).toHaveLength(0);
				}
			);

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
				const initialExitListeners = new Set(process.listeners("exit"));
				const server = await startServer();
				const containerExitListeners = () =>
					process
						.listeners("exit")
						.filter(
							(listener) =>
								!initialExitListeners.has(listener) &&
								listener.name === "cleanupContainerImages"
						);

				if (scenario === "unlinked" || scenario === "absent") {
					expect(prepareContainerImagesForDev).not.toHaveBeenCalled();
				} else {
					expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(1);
					const options = vi.mocked(prepareContainerImagesForDev).mock
						.calls[0]?.[0].containerOptions;
					expect(options).toHaveLength(scenario === "configured" ? 1 : 0);
				}

				if (
					mode === "preview" ||
					scenario === "image-free" ||
					scenario === "unlinked" ||
					scenario === "absent"
				) {
					expect(containerExitListeners()).toHaveLength(0);
					await server.close();
					expect(cleanupContainers).not.toHaveBeenCalled();
					return;
				}

				expect(containerExitListeners()).toHaveLength(1);
				const firstExitListener = containerExitListeners()[0];
				const secondServer = await startServer();
				expect(containerExitListeners()).toHaveLength(2);
				const plannedImages = vi
					.mocked(prepareContainerImagesForDev)
					.mock.calls.map(
						([args]) =>
							new Set(args.containerOptions.map(({ image_tag }) => image_tag))
					);
				vi.mocked(cleanupContainers).mockReturnValueOnce(false);
				await server.close();
				expect(cleanupContainers).toHaveBeenCalledExactlyOnceWith(
					expect.any(String),
					plannedImages[0]
				);
				expect(containerExitListeners()).toHaveLength(2);
				expect(containerExitListeners()).toContain(firstExitListener);
				firstExitListener?.(0);
				expect(cleanupContainers).toHaveBeenNthCalledWith(
					2,
					expect.any(String),
					plannedImages[0]
				);
				expect(containerExitListeners()).toHaveLength(1);
				expect(containerExitListeners()).not.toContain(firstExitListener);

				const secondExitListener = containerExitListeners()[0];
				expect(secondExitListener).toBeDefined();
				secondExitListener?.(0);
				expect(cleanupContainers).toHaveBeenNthCalledWith(
					3,
					expect.any(String),
					plannedImages[1]
				);
				await secondServer.close();
				expect(cleanupContainers).toHaveBeenCalledTimes(3);
				expect(containerExitListeners()).toHaveLength(0);
			}
		);
	}
);
