import { execSync } from "child_process";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { getDockerPath } from "../src/environment-variables/misc-variables";
import { dedent } from "../src/utils/dedent";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

const imageSource = ["pull", "build"];

// We can only really run these tests on Linux, because we build our images for linux/amd64,
// and github runners don't really support container virtualization in any sane way
describe
	.skipIf(
		!CLOUDFLARE_ACCOUNT_ID ||
			(process.platform !== "linux" && process.env.CI === "true")
	)
	.each(imageSource)(
	"containers local dev tests: %s",
	{ timeout: 90_000 },
	(source) => {
		let helper: WranglerE2ETestHelper;
		let workerName: string;
		let wranglerConfig: Record<string, unknown>;

		beforeAll(async () => {
			workerName = generateResourceName();

			helper = new WranglerE2ETestHelper();
			wranglerConfig = {
				name: `${workerName}`,
				main: "src/index.ts",
				compatibility_date: "2025-04-03",
				containers: [
					{
						image: "./Dockerfile",
						class_name: `E2EContainer`,
						name: `${workerName}-container`,
					},
				],
				durable_objects: {
					bindings: [
						{
							class_name: `E2EContainer`,
							name: "CONTAINER",
						},
					],
				},
				migrations: [
					{
						tag: "v1",
						new_classes: [`E2EContainer`],
					},
				],
			};
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig),
				"src/index.ts": dedent`
					import { DurableObject } from "cloudflare:workers";

					export class E2EContainer extends DurableObject<Env> {
						container: globalThis.Container;

						constructor(ctx: DurableObjectState, env: Env) {
							super(ctx, env);
							this.container = ctx.container!;
						}

						async fetch(req: Request) {
							const path = new URL(req.url).pathname;
							switch (path) {
								case "/status":
									return new Response(JSON.stringify(this.container.running));

								case "/start":
									this.container.start({
										entrypoint: ["node", "app.js"],
										env: { MESSAGE: "I'm an env var!" },
										enableInternet: false,
									});
									return new Response("Container create request sent...");

								case "/fetch":
									const res = await this.container
										.getTcpPort(8080)
										.fetch("http://foo/bar/baz");
									return new Response(await res.text());
								default:
									return new Response("Hi from Container DO");
							}
						}
					}

					export default {
						async fetch(request, env): Promise<Response> {
							const id = env.CONTAINER.idFromName("container");
							const stub = env.CONTAINER.get(id);
							return stub.fetch(request);
						},
					} satisfies ExportedHandler<Env>;`,
				Dockerfile: dedent`
					FROM node:22-alpine

					WORKDIR /usr/src/app

					COPY ./container/app.js app.js
					EXPOSE 8080
					`,
				"container/app.js": dedent`
				const { createServer } = require("http");

				const server = createServer(function (req, res) {
					res.writeHead(200, { "Content-Type": "text/plain" });
					res.write("Hello World! Have an env var! " + process.env.MESSAGE);
					res.end();
				});

				server.listen(8080, function () {
					console.log("Server listening on port 8080");
				});
				`,
			});
			// if we are pulling we need to push the image first
			if (source === "pull") {
				// pull a container image from the registry
				await helper.run(
					`wrangler containers build . -t ${workerName}:tmp-e2e -p`
				);

				wranglerConfig = {
					...wranglerConfig,
					containers: [
						{
							image: `registry.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/${workerName}:tmp-e2e`,
							class_name: `E2EContainer`,
							name: `${workerName}-container`,
						},
					],
				};
				await helper.seed({
					"wrangler.json": JSON.stringify(wranglerConfig),
				});
				// wait a bit for the image to be available to pull
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
		}, 30_000);
		beforeEach(async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig),
			});
			// cleanup any running containers
			const ids = getContainerIds("e2econtainer");
			if (ids.length > 0) {
				console.log(ids);
				execSync(`${getDockerPath()} rm -f ${ids.join(" ")}`, {
					encoding: "utf8",
				});
			}
		});
		afterAll(async () => {
			const ids = getContainerIds("e2econtainer");
			if (ids.length > 0) {
				execSync(`${getDockerPath()} rm -f ${ids.join(" ")}`, {
					encoding: "utf8",
				});
			}
			if (source === "pull") {
				// TODO: we won't need to prefix the account id once 9811 lands
				await helper.run(
					`wrangler containers images delete ${CLOUDFLARE_ACCOUNT_ID}/${workerName}:tmp-e2e`
				);
			}
		});
		it(`will build or pull containers when miniflare starts`, async () => {
			const worker = helper.runLongLived("wrangler dev");
			await worker.readUntil(/Preparing container/);
			if (source === "pull") {
				await worker.readUntil(/Status/);
			} else {
				await worker.readUntil(/DONE/);
			}
			// from miniflare output:
			await worker.readUntil(/Container image\(s\) ready/);
		});

		it(`will be able to interact with the container`, async () => {
			const worker = helper.runLongLived("wrangler dev");
			const ready = await worker.waitForReady();
			await worker.readUntil(/Container image\(s\) ready/);

			let response = await fetch(`${ready.url}/status`);
			expect(response.status).toBe(200);
			let status = await response.json();
			expect(status).toBe(false);

			response = await fetch(`${ready.url}/start`);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toBe("Container create request sent...");

			// Wait a bit for container to start
			await new Promise((resolve) => setTimeout(resolve, 2_000));

			response = await fetch(`${ready.url}/status`);
			status = await response.json();
			expect(response.status).toBe(200);
			expect(status).toBe(true);

			response = await fetch(`${ready.url}/fetch`);
			expect(response.status).toBe(200);
			text = await response.text();
			expect(text).toBe("Hello World! Have an env var! I'm an env var!");
			// Check that a container is running using `docker ps`
			const ids = getContainerIds("e2econtainer");
			expect(ids.length).toBe(1);
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
			await worker.stop();
			const output = await worker.output;
			expect(output).not.toContain("Preparing container image(s)...");
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
			await worker.stop();
			expect(await worker.output).not.toContain(
				"Preparing container image(s)..."
			);
		});

		it("won't start the container service if --enable-containers is set to false via CLI", async () => {
			const worker = helper.runLongLived(
				"wrangler dev --enable-containers=false"
			);
			await worker.waitForReady();
			await worker.stop();
			expect(await worker.output).not.toContain(
				"Preparing container image(s)..."
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
				if (source === "pull") {
					await helper.run(
						`wrangler containers build . -t ${workerName}:tmp-e2e -p`
					);
				}
			});
			// this will never run in CI
			it.skipIf(process.platform === "linux")(
				"errors in windows/macos if no ports are exposed",
				async () => {
					const worker = helper.runLongLived("wrangler dev");
					expect(await worker.exitCode).toBe(1);
					expect(await worker.output).toContain("does not expose any ports");
				}
			);

			it.skipIf(process.platform !== "linux")(
				"doesn't error in linux if no ports are exposed",
				async () => {
					const worker = helper.runLongLived("wrangler dev");
					await worker.readUntil(/Preparing container/);
					if (source === "pull") {
						await worker.readUntil(/Status/);
					} else {
						await worker.readUntil(/DONE/);
					}
					await worker.readUntil(/Container image\(s\) ready/);
				}
			);
		});

		it("errors if docker is not installed", async () => {
			vi.stubEnv("WRANGLER_DOCKER_BIN", "not-a-real-docker-binary");
			const worker = helper.runLongLived("wrangler dev");
			expect(await worker.exitCode).toBe(1);
			expect(await worker.output).toContain(
				`The Docker CLI could not be launched. Please ensure that the Docker CLI is installed and the daemon is running.`
			);
			expect(await worker.output).toContain(
				`To suppress this error if you do not intend on triggering any container instances, set dev.enable_containers to false in your Wrangler config or passing in --enable-containers=false.`
			);
			vi.unstubAllEnvs();
		});
	}
);

/** gets any containers that were created by running this fixture */
const getContainerIds = (class_name: string) => {
	// note the -a to include stopped containers

	const allContainers = execSync(`${getDockerPath()} ps -a --format json`)
		.toString()
		.split("\n")
		.filter((line) => line.trim());
	if (allContainers.length === 0) {
		return [];
	}
	const jsonOutput = allContainers.map((line) => JSON.parse(line));

	return jsonOutput.map((container) => {
		if (container.Image.includes(`cloudflare-dev/${class_name}`)) {
			return container.ID;
		}
	});
};
