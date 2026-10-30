import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { getZoneFromRoute } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import { createBuilder, preview } from "vite";
import { afterEach, describe, test, vi } from "vitest";
import { cloudflare } from "../index";
import type { ParsedInputConfigWithWorker } from "../index";

vi.mock("@cloudflare/workers-utils");

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("preview server", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	test.for([
		{ domain: undefined, expectedHostname: undefined },
		{ domain: "example.com", expectedHostname: "example.com" },
		{
			domain: {
				hostname: "previews.example.com",
				production: false,
				previews: true,
			},
			expectedHostname: "previews.example.com",
		},
	])(
		"serves a Worker with domain %j and disposes Miniflare when closed",
		async ({ domain, expectedHostname }, { expect }) => {
			const actual = await vi.importActual<
				typeof import("@cloudflare/workers-utils")
			>("@cloudflare/workers-utils");
			vi.mocked(getZoneFromRoute).mockImplementation(actual.getZoneFromRoute);
			const disposeSpy = vi.spyOn(Miniflare.prototype, "dispose");
			const builder = await createBuilder({
				root: fixturesPath,
				logLevel: "silent",
				plugins: [
					cloudflare({
						inspectorPort: false,
						persistState: false,
						config(loadedConfig) {
							return {
								...loadedConfig,
								accountId: "customized-account",
								complianceRegion: "fedramp-high",
								containers: [
									...loadedConfig.containers,
									{
										name: "customized-container",
										image: {
											reference: "docker.io/cloudflare/hello-world:latest",
										},
										maxInstances: 2,
									},
								],
								worker: {
									...loadedConfig.worker,
									domains: domain === undefined ? undefined : [domain],
								},
							};
						},
					}),
				],
			});

			// Build the worker
			await builder.buildApp();
			const output = await readBuildOutput(fixturesPath);
			expect(output.rootConfig).toMatchObject({
				accountId: "customized-account",
				complianceRegion: "fedramp-high",
			});
			expect(output.containers.map(({ config }) => config)).toEqual([
				expect.objectContaining({
					name: "customized-container",
					image: { reference: "docker.io/cloudflare/hello-world:latest" },
					maxInstances: 2,
				}),
			]);
			const customizePreview = vi.fn(
				(loadedConfig: ParsedInputConfigWithWorker) => ({
					...loadedConfig,
				})
			);

			// Start a preview server
			const previewServer = await preview({
				root: fixturesPath,
				logLevel: "silent",
				preview: { port: 0 },
				plugins: [
					cloudflare({
						inspectorPort: false,
						persistState: false,
						config: customizePreview,
					}),
				],
			});

			try {
				expect(customizePreview).not.toHaveBeenCalled();
				const url = previewServer.resolvedUrls?.local[0];
				assert(url);
				expect(await (await fetch(url)).text()).toBe("Hello World!");
				if (expectedHostname === undefined) {
					expect(getZoneFromRoute).not.toHaveBeenCalled();
				} else {
					expect(getZoneFromRoute).toHaveBeenCalledWith(expectedHostname);
				}
				expect(disposeSpy).not.toHaveBeenCalled();
			} finally {
				await previewServer.close();
			}
			expect(disposeSpy).toHaveBeenCalled();
		}
	);
});
