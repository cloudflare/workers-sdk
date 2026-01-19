import { resolve } from "node:path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] Service bindings to Worker with assets", () => {
	let ipWorkerA: string,
		portWorkerA: number,
		stopWorkerA: (() => Promise<unknown>) | undefined,
		getOutputWorkerA: () => string;
	let stopWorkerB: (() => Promise<unknown>) | undefined,
		getOutputWorkerB: () => string;
	let stopWorkerC: (() => Promise<unknown>) | undefined,
		getOutputWorkerC: () => string;
	let stopWorkerD: (() => Promise<unknown>) | undefined;
	let stopWorkerWS: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ stop: stopWorkerB, getOutput: getOutputWorkerB } = await runWranglerDev(
			resolve(__dirname, "..", "workerB-with-default-export"),
			["--port=0", "--inspector-port=0"]
		));

		({ stop: stopWorkerC, getOutput: getOutputWorkerC } = await runWranglerDev(
			resolve(__dirname, "..", "workerC-with-default-entrypoint"),
			["--port=0", "--inspector-port=0"]
		));

		({ stop: stopWorkerD } = await runWranglerDev(
			resolve(__dirname, "..", "workerD-with-named-entrypoint"),
			["--port=0", "--inspector-port=0"]
		));

		({ stop: stopWorkerWS } = await runWranglerDev(
			resolve(__dirname, "..", "workerWS"),
			["--port=0", "--inspector-port=0"]
		));

		({
			ip: ipWorkerA,
			port: portWorkerA,
			stop: stopWorkerA,
			getOutput: getOutputWorkerA,
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
		await stopWorkerWS?.();
	});

	describe("Workers running in separate wrangler dev sessions", () => {
		describe("Service binding to default export", () => {
			it("should return Asset Worker response for routes that serve static content", async () => {
				await vi.waitFor(async () => {
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_EXPORT.fetch() response: This is an asset of "worker-b"`
					);

					response = await fetch(`http://${ipWorkerA}:${portWorkerA}/busy-bee`);
					text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_EXPORT.fetch() response: All "worker-b" 🐝🐝🐝 are 🐝sy. Please come back later`
					);
				});
			});

			it("should return User Worker response for routes that don't serve static content", async () => {
				await vi.waitFor(async () => {
					let response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_EXPORT.fetch() response: Hello from worker-b fetch()"
					);
				});
			});

			it("should return User Worker response for named functions", async () => {
				await vi.waitFor(async () => {
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
			});

			it("should return cron trigger responses", async () => {
				await vi.waitFor(async () => {
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
					expect(getOutputWorkerB()).toContain(
						"Hello from worker-b scheduled()"
					);
				});
			});

			it("should support promise pipelining", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_EXPORT.foo("✨").bar.buzz() response: You made it! ✨`
					);
				});
			});

			it("should support property access", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_EXPORT.honey response: Bees make honey in worker-b`
					);
					expect(text).toContain(
						`env.DEFAULT_EXPORT.honeyBee response: I am worker-b's honeyBee prop`
					);
				});
			});
		});

		describe("Service binding to default entrypoint", () => {
			it("should return Asset Worker response for fetch requests for routes that serve static content", async () => {
				await vi.waitFor(async () => {
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.fetch() response: This is an asset of "worker-c"`
					);

					response = await fetch(`http://${ipWorkerA}:${portWorkerA}/busy-bee`);
					text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.fetch() response: All "worker-c" 🐝🐝🐝 are 🐝sy. Please come back later`
					);
				});
			});

			it("should return User Worker response for routes that don't serve static content", async () => {
				await vi.waitFor(async () => {
					let response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.DEFAULT_ENTRYPOINT.fetch() response: Hello from worker-c fetch()"
					);
				});
			});

			it("should return User Worker response for named functions", async () => {
				await vi.waitFor(async () => {
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
			});

			it("should return cron trigger responses", async () => {
				await vi.waitFor(async () => {
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

			it("should support promise pipelining", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.foo("🐜").bar.buzz() response: You made it! 🐜`
					);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.newBeeCounter().value response: 2`
					);
				});
			});

			it("should support property access", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.honey response: Bees make honey in worker-c`
					);
					expect(text).toContain(
						`env.DEFAULT_ENTRYPOINT.honeyBee response: I am worker-c's honeyBee prop`
					);
				});
			});
		});

		describe("Service binding to named entrypoint", () => {
			it("should return User Worker response for fetch requests", async () => {
				await vi.waitFor(async () => {
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
			});

			it("should return User Worker response for named functions", async () => {
				await vi.waitFor(async () => {
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

			it("should support promise pipelining", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.foo("🐙").bar.buzz() response: You made it! 🐙`
					);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.newBeeCounter().value response: 2`
					);
				});
			});

			it("should support property access", async () => {
				await vi.waitFor(async () => {
					// fetch URL is irrelevant here. workerA will internally call
					// the appropriate fns on the service binding instead
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.honey response: Bees make honey in worker-d`
					);
					expect(text).toContain(
						`env.NAMED_ENTRYPOINT.honeyBee response: I am worker-d's honeyBee prop`
					);
				});
			});
		});

		describe("Service binding to a Worker which handles WebSockets", () => {
			it("should return Asset Worker response for fetch requests for routes that serve static content", async () => {
				await vi.waitFor(async () => {
					let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.WS.fetch() response: This is an asset of "worker-ws"`
					);

					response = await fetch(`http://${ipWorkerA}:${portWorkerA}/busy-bee`);
					text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.WS.fetch() response: All "worker-ws" 🐝🐝🐝 are 🐝sy. Please come back later`
					);
				});
			});

			it("should return User Worker response for fetch requests for routes that do not serve static content", async () => {
				await vi.waitFor(async () => {
					// this request does not have the "Upgrade" header set to "websocket" because
					// workerA does not attach this header to the request
					let response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					let text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						`env.WS.fetch() response: Hello from worker-ws fetch()`
					);
				});
			});

			it("should be able to communicate over WebSocket", async () => {
				await vi.waitFor(async () => {
					// workerA will internally set the "Upgrade" header value to "websocket" and attach
					// the header to the request
					const response = await fetch(
						`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
					);
					const text = await response.text();
					expect(response.status).toBe(200);
					expect(text).toContain(
						"env.WS.fetch() response: Hello from worker-ws fetch()"
					);

					// add a timeout to allow stdout to update
					await setTimeout(500);
					expect(getOutputWorkerA()).toContain("pong: hello from client");
				});
			});
		});
	});
});
