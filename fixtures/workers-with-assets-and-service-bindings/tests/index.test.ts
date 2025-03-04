import { resolve } from "node:path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const devCmds = [{ args: [] }, { args: ["--x-assets-rpc"] }];

describe.each(devCmds)(
	"[wrangler dev $args][Workers + Assets] Service bindings to Worker with assets",
	({ args }) => {
		describe("Workers running in separate wrangler dev sessions", () => {
			let ipWorkerA: string,
				portWorkerA: number,
				stopWorkerA: (() => Promise<unknown>) | undefined;
			let ipWorkerB: string,
				portWorkerB: number,
				stopWorkerB: (() => Promise<unknown>) | undefined,
				getOutputWorkerB: () => string;
			let ipWorkerC: string,
				portWorkerC: number,
				stopWorkerC: (() => Promise<unknown>) | undefined,
				getOutputWorkerC: () => string;
			let ipWorkerD: string,
				portWorkerD: number,
				stopWorkerD: (() => Promise<unknown>) | undefined;

			beforeAll(async () => {
				({
					ip: ipWorkerA,
					port: portWorkerA,
					stop: stopWorkerA,
				} = await runWranglerDev(resolve(__dirname, "..", "workerA"), [
					"--port=0",
					"--inspector-port=0",
				]));

				({
					ip: ipWorkerB,
					port: portWorkerB,
					stop: stopWorkerB,
					getOutput: getOutputWorkerB,
				} = await runWranglerDev(
					resolve(__dirname, "..", "workerB-with-default-export"),
					[
						"--port=0",
						"--inspector-port=0",
						// we need this flag in order to be able to test Cron Triggers
						// see https://developers.cloudflare.com/workers/examples/cron-trigger/#test-cron-triggers-using-wrangler
						"--test-scheduled",
						...args,
					]
				));

				({
					ip: ipWorkerC,
					port: portWorkerC,
					stop: stopWorkerC,
					getOutput: getOutputWorkerC,
				} = await runWranglerDev(
					resolve(__dirname, "..", "workerC-with-default-entrypoint"),
					[
						"--port=0",
						"--inspector-port=0",
						// we need this flag in order to be able to test Cron Triggers
						// see https://developers.cloudflare.com/workers/examples/cron-trigger/#test-cron-triggers-using-wrangler
						"--test-scheduled",
						...args,
					]
				));

				({
					ip: ipWorkerD,
					port: portWorkerD,
					stop: stopWorkerD,
				} = await runWranglerDev(
					resolve(__dirname, "..", "workerD-with-named-entrypoint"),
					["--port=0", "--inspector-port=0", ...args]
				));
			});

			afterAll(async () => {
				await stopWorkerA?.();
				await stopWorkerB?.();
				await stopWorkerC?.();
				await stopWorkerD?.();
			});

			describe("WorkerA", () => {
				// this currently incorrectly returns worker-d's User Worker response
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
						expect(text).toContain(
							`env.DEFAULT_ENTRYPOINT.fetch() response: This is an asset of "worker-c"`
						);
						expect(text).toContain(
							`env.NAMED_ENTRYPOINT.fetch() response: This is an asset of "worker-d"`
						);

						response = await fetch(
							`http://${ipWorkerA}:${portWorkerA}/busy-bee`
						);
						text = await response.text();
						expect(response.status).toBe(200);
						expect(text).toContain(
							`env.DEFAULT_EXPORT.fetch() response: All "worker-b" 🐝🐝🐝 are 🐝sy. Please come back later`
						);
						expect(text).toContain(
							`env.DEFAULT_ENTRYPOINT.fetch() response: All "worker-c" 🐝🐝🐝 are 🐝sy. Please come back later`
						);
						expect(text).toContain(
							`env.NAMED_ENTRYPOINT.fetch() response: All "worker-d" 🐝🐝🐝 are 🐝sy. Please come back later`
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
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.fetch() response: Hello from worker-c fetch()"
					);
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
						"env.DEFAULT_EXPORT.bee() response: Hello from worker-b bee()"
					);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.bee() response: Hello from worker-c bee()"
					);
					expect(text).toContain(
						"env.NAMED_ENTRYPOINT.bee() response: Hello from worker-d bee()"
					);
					expect(text).toContain(
						'env.DEFAULT_EXPORT.busyBee("🐝") response: Not supported. When calling a top-level handler function that is not declared as part of a class, you must always send exactly one argument. In order to support variable numbers of arguments, the server must use class-based syntax (extending WorkerEntrypoint) instead.'
					);
					expect(text).toContain(
						'env.DEFAULT_ENTRYPOINT.busyBee("🐝") response: Hello busy 🐝s from worker-c busyBee(bee)'
					);
					expect(text).toContain(
						'env.NAMED_ENTRYPOINT.busyBee("🐝") response: Hello busy 🐝s from worker-d busyBee(bee)'
					);
				});

				it("should return cron trigger responses", async ({ expect }) => {
					// fetch URL is irrelevant here. workerA will internally make a
					// request to `http://fakehost/cdn-cgi/mf/scheduled` instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_EXPORT.scheduled() response: undefined"
					);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.scheduled() response: undefined"
					);
					expect(text).toContain(
						"env.NAMED_ENTRYPOINT.scheduled() response: Not supported. Cron Triggers can only be defined on default exports."
					);

					// add a timeout to allow stdout to update
					await setTimeout(500);
					console.log(getOutputWorkerB());
					expect(getOutputWorkerB()).toContain(
						"Hello from worker-b scheduled()"
					);
					expect(getOutputWorkerC()).toContain(
						"Hello from worker-c scheduled()"
					);
				});
			});
		});
	}
);
