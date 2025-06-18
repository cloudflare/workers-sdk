import { beforeEach, describe, expect, it, vi } from "vitest";
import { dedent } from "../src/utils/dedent";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const wranglerConfigBuild = {
	name: "container-app-build",
	main: "src/index.ts",
	compatibility_date: "2025-04-03",
	containers: [
		{
			configuration: {
				image: "./Dockerfile",
			},
			class_name: "Container",
			name: "http2",
			max_instances: 2,
		},
	],
	durable_objects: {
		bindings: [
			{
				class_name: "Container",
				name: "CONTAINER",
			},
		],
	},
	migrations: [
		{
			tag: "v1",
			new_classes: ["Container"],
		},
	],
};

const wranglerConfigPull = {
	...wranglerConfigBuild,
	name: "container-app-pull",
	containers: [
		{
			configuration: {
				image:
					"registry.cloudflare.com/8d783f274e1f82dc46744c297b015a2f/ci-container-dont-delete:latest",
			},
			class_name: "Container",
			name: "http2",
			max_instances: 2,
		},
	],
};

// TODO: docker is not installed by default on macOS runners in github actions.
// And windows is being difficult.
// So we skip these tests in CI, and test this locally for now :/
describe.skipIf(process.platform !== "linux" && process.env.CI === "true")(
	"containers local dev tests",
	{ timeout: 90_000 },
	() => {
		const configs = [
			{ name: "build", config: wranglerConfigBuild },
			{ name: "pull", config: wranglerConfigPull },
		];

		configs.forEach(({ name, config }) => {
			describe(`with ${name} config`, () => {
				let helper: WranglerE2ETestHelper;

				beforeEach(async () => {
					helper = new WranglerE2ETestHelper();
					await helper.seed({
						"wrangler.json": JSON.stringify(config),
						"src/index.ts": dedent`
							import { DurableObject } from "cloudflare:workers";
							export class Container extends DurableObject {}
							export default {
								async fetch() {
								},
							};
							`,
						"package.json": dedent`
							{
								"name": "worker",
								"version": "0.0.0",
								"private": true
							}
							`,
					});
					if (config.name === "container-app-build") {
						await helper.seed({
							Dockerfile: dedent`
							FROM alpine:latest
							CMD ["echo", "hello world"]
							EXPOSE 8080
							`,
						});
					}
				});

				it(`will build containers when miniflare starts`, async () => {
					const worker = helper.runLongLived("wrangler dev");
					// from docker build output:
					await worker.waitForReady();
					await worker.readUntil(/Loading container/);
					if (config.name === "container-app-build") {
						await worker.readUntil(/DONE/);
					}
					// from miniflare output:
					await worker.readUntil(/Container\(s\) ready/);
				});

				it("won't start the container service if no containers are present", async () => {
					await helper.seed({
						"wrangler.json": JSON.stringify({
							...config,
							containers: [],
						}),
					});
					const worker = helper.runLongLived("wrangler dev");
					await worker.waitForReady();
					// await worker.exitCode;
					await worker.stop();
					const output = await worker.output;
					expect(output).not.toContain("Loading container image(s)...");
				});

				it("won't start the container service if enable_containers is set to false via config", async () => {
					await helper.seed({
						"wrangler.json": JSON.stringify({
							...config,
							dev: { enable_containers: false },
						}),
					});
					const worker = helper.runLongLived("wrangler dev");
					await worker.waitForReady();
					await worker.stop();
					expect(await worker.output).not.toContain(
						"Loading container image(s)..."
					);
				});

				it("won't start the container service if --enable-containers is set to false via CLI", async () => {
					const worker = helper.runLongLived(
						"wrangler dev --enable-containers=false"
					);
					await worker.waitForReady();
					await worker.stop();
					expect(await worker.output).not.toContain(
						"Loading container image(s)..."
					);
				});

				describe("make sure ports are exposed if necessary", () => {
					beforeEach(async () => {
						await helper.seed({
							Dockerfile: dedent`
							FROM alpine:latest
							CMD ["echo", "hello world"]
							`,
						});
					});
					it.skipIf(process.platform === "linux")(
						"errors in windows/macos if no ports are exposed",
						async () => {
							const worker = helper.runLongLived("wrangler dev");
							expect(await worker.exitCode).toBe(1);
						}
					);

					it.skipIf(process.platform !== "linux")(
						"doesn't error in linux if no ports are exposed",
						async () => {
							const worker = helper.runLongLived("wrangler dev");
							await worker.waitForReady();
							await worker.readUntil(/Loading container/);
							if (config.name === "container-app-build") {
								await worker.readUntil(/DONE/);
							}
							await worker.readUntil(/Container\(s\) ready/);
						}
					);
				});

				it("errors if docker is not installed", async () => {
					vi.stubEnv(
						"WRANGLER_CONTAINERS_DOCKER_PATH",
						"not-a-real-docker-binary"
					);
					const worker = helper.runLongLived("wrangler dev");
					expect(await worker.exitCode).toBe(1);
					expect(await worker.output).toContain(
						`The Docker CLI does not appear to installed. Please ensure that the Docker CLI is installed. You can specify an executable with the environment variable WRANGLER_CONTAINERS_DOCKER_PATH.`
					);
				});
			});
		});
	}
);
