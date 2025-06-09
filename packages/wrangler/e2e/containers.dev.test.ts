import { beforeEach, describe, expect, it } from "vitest";
import { dedent } from "../src/utils/dedent";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

const wranglerConfig = {
	name: "container-app",
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

// TODO: we'll want to run this on all OSes but that will require some setup because docker is not installed by default on macos and windows
describe.skipIf(process.platform !== "linux" && process.env.CI === "true")(
	"containers local dev tests",
	{ timeout: 90_000 },
	() => {
		let helper: WranglerE2ETestHelper;

		beforeEach(async () => {
			helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig),
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
				Dockerfile: dedent`
					FROM alpine:latest
					CMD ["echo", "hello world"]
					`,
			});
		});
		it(`will build containers when miniflare starts`, async () => {
			const worker = helper.runLongLived("wrangler dev");
			// from docker build output:
			await worker.waitForReady();
			expect(worker.currentOutput).toContain("Building container(s)...");
			await worker.readUntil(/DONE/);
			// from miniflare output:
			await worker.readUntil(/Container\(s\) built and ready/);
		});

		it("won't start the container service if no containers are present", async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					...wranglerConfig,
					containers: [],
				}),
			});
			const worker = helper.runLongLived("wrangler dev");
			await worker.waitForReady();
			expect(worker.output).not.toContain("Building container(s)...");
		});

		it("won't start the container service if enable_containers is set to false via config", async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					...wranglerConfig,
					dev: { enable_containers: false },
				}),
			});
			const worker = helper.runLongLived("wrangler dev");
			await worker.waitForReady();
			expect(worker.output).not.toContain("Building container(s)...");
		});

		it("won't start the container service if --enable-containers is set to false via CLI", async () => {
			const worker = helper.runLongLived(
				"wrangler dev --enable-containers=false"
			);
			await worker.waitForReady();
			expect(worker.output).not.toContain("Building container(s)...");
		});
		it("errors if docker is not installed", async () => {
			vi.stubEnv("WRANGLER_CONTAINERS_DOCKER_PATH", "not-a-real-docker-binary");
			const worker = helper.runLongLived("wrangler dev");
			expect(await worker.exitCode).toBe(1);
			expect(await worker.output).toContain(
				`The Docker CLI does not appear to installed. Please ensure that the Docker CLI is installed. You can specify an executable with the environment variable WRANGLER_CONTAINERS_DOCKER_PATH.`
			);
		});
	}
);
