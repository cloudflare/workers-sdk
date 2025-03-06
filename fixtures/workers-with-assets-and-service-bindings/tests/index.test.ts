import { resolve } from "node:path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const devCmds = [{ args: [] }, { args: ["--x-assets-rpc"] }];

describe.each(devCmds)(
	"[wrangler dev $args][Workers + Assets] Service bindings to Worker with assets",
	({ args }) => {
		let ipWorkerA: string,
			portWorkerA: number,
			stopWorkerA: (() => Promise<unknown>) | undefined;
		let stopWorkerB: (() => Promise<unknown>) | undefined,
			getOutputWorkerB: () => string;
		let stopWorkerC: (() => Promise<unknown>) | undefined,
			getOutputWorkerC: () => string;
		let stopWorkerD: (() => Promise<unknown>) | undefined;

		beforeAll(async () => {
			({ getOutput: getOutputWorkerB } = await runWranglerDev(
				resolve(__dirname, "..", "workerB-with-default-export"),
				["--port=0", "--inspector-port=0", ...args]
			));

			({ getOutput: getOutputWorkerC } = await runWranglerDev(
				resolve(__dirname, "..", "workerC-with-default-entrypoint"),
				["--port=0", "--inspector-port=0", ...args]
			));

			({ stop: stopWorkerD } = await runWranglerDev(
				resolve(__dirname, "..", "workerD-with-named-entrypoint"),
				["--port=0", "--inspector-port=0", ...args]
			));

			({
				ip: ipWorkerA,
				port: portWorkerA,
				stop: stopWorkerA,
			} = await runWranglerDev(resolve(__dirname, "..", "workerA"), [
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stopWorkerA?.();
			await stopWorkerB?.();
			await stopWorkerC?.();
			await stopWorkerD?.();
		});

		describe("Workers running in separate wrangler dev sessions", () => {
			describe("Service binding to default export", () => {
				// this currently incorrectly returns the User Worker response
				// instead of the Asset Worker response
				it.fails(
					"should return Asset Worker response for routes that serve static content",
					async ({ expect }) => {
						let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
						let text = await response.text();
						expect(response.status).toBe(200);
						expect(text).toContain(
							`env.DEFAULT_EXPORT.fetch() response: This is an asset of "worker-b"`
						);

						response = await fetch(
							`http://${ipWorkerA}:${portWorkerA}/busy-bee`
						);
						text = await response.text();
						expect(response.status).toBe(200);
						expect(text).toContain(
							`env.DEFAULT_EXPORT.fetch() response: All "worker-b" 🐝🐝🐝 are 🐝sy. Please come back later`
						);
					}
				);

				it("should return User Worker response for routes that don't serve static content", async ({
					expect,
				}) => {
					let response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_EXPORT.fetch() response: Hello from worker-b fetch()"
					);
				});

				it("should return User Worker response for named functions", async ({
					expect,
				}) => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_EXPORT.bee() response: Workers in non-class based syntax do not support RPC functions with zero or variable number of arguments. They only support RPC functions with strictly one argument."
					);
					expect(text).toContain(
						'env.DEFAULT_EXPORT.busyBee("🐝") response: Hello busy 🐝s from worker-b busyBee(bee)'
					);
				});

				it("should return cron trigger responses", async ({ expect }) => {
					// fetch URL is irrelevant here. workerA will internally call
					// env.DEFAULT_EXPORT.scheduled({cron: "* * * * *"}) instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_EXPORT.scheduled() response: undefined"
					);

					// add a timeout to allow stdout to update
					await setTimeout(500);
					console.log(getOutputWorkerB());
					expect(getOutputWorkerB()).toContain(
						"Hello from worker-b scheduled()"
					);
				});
			});

			describe("Service binding to default entrypoint", () => {
				// this currently incorrectly returns the User Worker response
				// instead of the Asset Worker response
				it.fails(
					"should return Asset Worker response for fetch requestsfor routes that serve static content",
					async ({ expect }) => {
						let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
						let text = await response.text();
						expect(response.status).toBe(200);
						expect(text).toContain(
							`env.DEFAULT_ENTRYPOINT.fetch() response: This is an asset of "worker-c"`
						);

						response = await fetch(
							`http://${ipWorkerA}:${portWorkerA}/busy-bee`
						);
						text = await response.text();
						expect(response.status).toBe(200);
						expect(text).toContain(
							`env.DEFAULT_ENTRYPOINT.fetch() response: All "worker-c" 🐝🐝🐝 are 🐝sy. Please come back later`
						);
					}
				);

				it("should return User Worker response for routes that don't serve static content", async ({
					expect,
				}) => {
					let response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.fetch() response: Hello from worker-c fetch()"
					);
				});

				it("should return User Worker response for named functions", async ({
					expect,
				}) => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.bee() response: Hello from worker-c bee()"
					);
					expect(text).toContain(
						'env.DEFAULT_ENTRYPOINT.busyBee("🐝") response: Hello busy 🐝s from worker-c busyBee(bee)'
					);
				});

				it("should return cron trigger responses", async ({ expect }) => {
					// fetch URL is irrelevant here. workerA will internally call
					// env.DEFAULT_ENTRYPOINT.scheduled({cron: "* * * * *"}) instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.scheduled() response: undefined"
					);

					// add a timeout to allow stdout to update
					await setTimeout(500);
					expect(getOutputWorkerC()).toContain(
						"Hello from worker-c scheduled()"
					);
				});
			});

			describe("Service binding to named entrypoint", () => {
				it("should return User Worker response for fetch requests", async ({
					expect,
				}) => {
					// static asset route
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.fetch() response: Hello from worker-d fetch()`
					);

					// static asset route
					response = await fetch(`http://${ipWorkerA}:${portWorkerA}/busy-bee`);
					text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.fetch() response: Hello from worker-d fetch()`
					);

					// User Worker route
					response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.NAMED_ENTRYPOINT.fetch() response: Hello from worker-d fetch()"
					);
				});

				it("should return User Worker response for named functions", async ({
					expect,
				}) => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.NAMED_ENTRYPOINT.bee() response: Hello from worker-d bee()"
					);
					expect(text).toContain(
						'env.NAMED_ENTRYPOINT.busyBee("🐝") response: Hello busy 🐝s from worker-d busyBee(bee)'
					);
				});
			});
		});
	}
);
