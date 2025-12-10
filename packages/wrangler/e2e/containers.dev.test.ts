import { execSync } from "node:child_process";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { getDockerPath } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { buildImage } from "../../containers-shared/src/build";
import { generateContainerBuildId } from "../../containers-shared/src/utils";
import { dedent } from "../src/utils/dedent";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

const imageSource = ["pull", "build"] as const;

for (const source of imageSource) {
	// We can only really run these tests on Linux, because we build our images for linux/amd64,
	// and github runners don't really support container virtualization in any sane way
	const isCINonLinux =
		process.platform !== "linux" && process.env.CI === "true";

	// When pulling images an account id is necessary
	const isPullWithoutAccountId = source === "pull" && !CLOUDFLARE_ACCOUNT_ID;

	describe.skipIf(
		isCINonLinux ||
			isPullWithoutAccountId ||
			process.env.LOCAL_TESTS_WITHOUT_DOCKER
	)(`containers local dev tests: ${source}`, { timeout: 90_000 }, () => {
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
				await setTimeout(5_000);
			}
		}, 30_000);
		beforeEach(async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify(wranglerConfig),
			});
			/// wait a bit in case the expected cleanup from shutting down wrangler dev is already happening
			await setTimeout(500);
			// cleanup any running containers. this does happen automatically when we shut down wrangler,
			// but treekill is being uncooperative. this is also tested in interactive-dev-fixture
			// where it is working as expected
			const ids = getContainerIds("e2econtainer");
			if (ids.length > 0) {
				execSync(`${getDockerPath()} rm -f ${ids.join(" ")}`, {
					encoding: "utf8",
				});
			}
		});
		afterAll(async () => {
			// wait a bit in case the expected cleanup from shutting down wrangler dev is already happening
			await setTimeout(500);
			// again this should happen automatically when we shut down wrangler, but treekill is being uncooperative.
			// this is tested in interactive-dev-fixture where it is working as expected.
			const ids = getContainerIds("e2econtainer");
			if (ids.length > 0) {
				execSync(`${getDockerPath()} rm -f ${ids.join(" ")}`, {
					encoding: "utf8",
				});
			}
			if (source === "pull") {
				// TODO: we won't need to prefix the account id once 9811 lands
				await helper.run(
					`wrangler containers images delete ${workerName}:tmp-e2e`
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

			await vi.waitFor(async () => {
				const response = await fetch(`${ready.url}/status`);
				expect(response.status).toBe(200);
				const status = await response.json();
				expect(status).toBe(false);
			});

			let response = await fetch(`${ready.url}/start`);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toBe("Container create request sent...");

			await vi.waitFor(async () => {
				response = await fetch(`${ready.url}/status`);
				expect(response.status).toBe(200);
				const status = await response.json();
				expect(status).toBe(true);
			});

			await vi.waitFor(
				async () => {
					response = await fetch(`${ready.url}/fetch`, {
						signal: AbortSignal.timeout(3_000),
						headers: { "MF-Disable-Pretty-Error": "true" },
					});
					text = await response.text();
					expect(text).toBe("Hello World! Have an env var! I'm an env var!");
				},
				{ timeout: 5_000 }
			);

			// Check that a container is running using `docker ps`
			const ids = getContainerIds("e2econtainer");
			expect(ids.length).toBe(1);
			await worker.stop();
		});

		it("should clean up duplicate image tags after build", async () => {
			const dockerPath = getDockerPath();
			const fakeBuildID = generateContainerBuildId();
			const initialImageTag = `cloudflare-dev/test-cleanup:${fakeBuildID}`;

			// First, build an image directly to create a duplicate tag scenario
			const build = await buildImage(dockerPath, {
				dockerfile: path.resolve(helper.tmpPath, "./Dockerfile"),
				image_tag: initialImageTag,
				class_name: "TestContainer",
				image_build_context: helper.tmpPath,
				image_vars: {},
			});
			await build.ready;

			const initialRepoTags = JSON.parse(
				execSync(
					`${dockerPath} image inspect ${initialImageTag} --format "{{ json .RepoTags }}"`,
					{ encoding: "utf8" }
				)
			);
			expect(initialRepoTags.length).toBeGreaterThan(0);

			// wrangler dev will rebuild/pull and trigger cleanup
			const worker = helper.runLongLived("wrangler dev");
			const ready = await worker.waitForReady();

			// check that the container can still start
			await vi.waitFor(async () => {
				const response = await fetch(`${ready.url}/status`);
				expect(response.status).toBe(200);
				const status = await response.json();
				expect(status).toBe(false);
			});

			// expect the original tag not to be there any more
			expect(() => {
				execSync(`${dockerPath} image inspect ${initialImageTag}`);
			}).toThrow();
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

		it("will display the ready-on message after the container(s) have been built/pulled", async () => {
			const worker = helper.runLongLived("wrangler dev");
			const readyRegexp = /Ready on (http:\/\/[a-z0-9.]+:[0-9]+)/;
			await worker.readUntil(readyRegexp);

			await worker.stop();

			const fullOutput = await worker.output;
			const indexOfContainersReadyMessage = fullOutput.indexOf(
				"Container image(s) ready"
			);

			const indexOfReadyOnMessage = fullOutput.indexOf("Ready on");
			expect(indexOfReadyOnMessage).toBeGreaterThan(
				indexOfContainersReadyMessage
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

		it("errors if no ports are exposed", async () => {
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
			const worker = helper.runLongLived("wrangler dev");
			expect(await worker.exitCode).toBe(1);
			expect(await worker.output).toContain("does not expose any ports");
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
	});
}

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

	const ids = jsonOutput.map((container) => {
		if (container.Image.includes(`cloudflare-dev/${class_name}`)) {
			return container.ID;
		}
	});
	return ids.filter(Boolean);
};
