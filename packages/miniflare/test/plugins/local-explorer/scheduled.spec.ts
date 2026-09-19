import { writeFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	singleModuleManifest,
	useDispose,
	useTmp,
	waitForWorkersInRegistry,
} from "../../test-shared";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api/local/scheduled`;
const NO_AGGREGATE_HEADER = "X-Miniflare-Explorer-No-Aggregate";

function scheduledRequest(
	worker: string,
	body: unknown,
	headers: Record<string, string> = {}
): [string, RequestInit] {
	return [
		`${BASE_URL}?${new URLSearchParams({ worker })}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		},
	];
}

function workerManifest(label: string) {
	return singleModuleManifest(`
		const invocations = [];
		export default {
			fetch() { return Response.json(invocations); },
			scheduled(controller) {
				invocations.push({
					label: ${JSON.stringify(label)},
					cron: controller.cron,
					scheduledTime: Number(controller.scheduledTime),
				});
				controller.noRetry();
			}
		};
	`);
}

describe("Local Explorer scheduled dispatch", () => {
	test("dispatches to a local Worker without the dev registry", async ({
		expect,
	}) => {
		const mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "local",
						compatibilityDate: "2026-01-01",
						manifest: workerManifest("local"),
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;

		const response = await mf.dispatchFetch(
			...scheduledRequest("local", {
				cron: "*/5 * * * *",
				scheduled_time: 123,
			})
		);
		const responseBody = await response.json();
		expect(response.status, JSON.stringify(responseBody)).toBe(200);
		expect(responseBody).toMatchObject({
			success: true,
			result: { outcome: "ok", noRetry: true },
		});

		const worker = await mf.getWorker("local");
		expect(await (await worker.fetch("http://localhost")).json()).toEqual([
			{ label: "local", cron: "*/5 * * * *", scheduledTime: 123 },
		]);
	});

	test("dispatches to the exact local Worker without unsafe trigger handlers", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		const mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "alpha",
						compatibilityDate: "2026-01-01",
						manifest: workerManifest("alpha"),
					},
				},
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "beta",
						compatibilityDate: "2026-01-01",
						manifest: workerManifest("beta"),
					},
				},
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "exception",
						compatibilityDate: "2026-01-01",
						manifest: singleModuleManifest(`
							export default {
								fetch() { return new Response("exception"); },
								scheduled() { throw new Error("scheduled failure"); }
							};
						`),
					},
				},
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "wait-until",
						compatibilityDate: "2026-01-01",
						manifest: singleModuleManifest(`
							const events = [];
							export default {
								fetch() { return Response.json(events); },
								scheduled(controller, env, ctx) {
									events.push("started");
									ctx.waitUntil(
										controller.cron === "reject-waitUntil"
											? Promise.reject(new Error("waitUntil rejected"))
											: Promise.resolve().then(() => events.push("waited"))
									);
									controller.noRetry();
								}
							};
						`),
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;
		await waitForWorkersInRegistry(registryPath, [
			"alpha",
			"beta",
			"exception",
			"wait-until",
		]);

		let response = await mf.dispatchFetch(
			...scheduledRequest("beta", {
				cron: " 0 17 * * SUN ",
				scheduled_time: 1_788_883_200_000,
			})
		);
		const responseBody = await response.json();
		expect(response.status, JSON.stringify(responseBody)).toBe(200);
		expect(responseBody).toMatchObject({
			success: true,
			result: { outcome: "ok", noRetry: true },
		});

		const alpha = await mf.getWorker("alpha");
		const beta = await mf.getWorker("beta");
		expect(await (await alpha.fetch("http://localhost")).json()).toEqual([]);
		expect(await (await beta.fetch("http://localhost")).json()).toEqual([
			{
				label: "beta",
				cron: " 0 17 * * SUN ",
				scheduledTime: 1_788_883_200_000,
			},
		]);

		const rawResponse = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/scheduled?cron=raw-is-gated"
		);
		expect(rawResponse.status).toBe(200);
		expect(await rawResponse.json()).toEqual([]);
		expect(await (await alpha.fetch("http://localhost")).json()).toEqual([]);

		const epochCases = [0, -1];
		for (const scheduledTime of epochCases) {
			response = await mf.dispatchFetch(
				...scheduledRequest("beta", {
					cron: `time-${scheduledTime}`,
					scheduled_time: scheduledTime,
				})
			);
			const body = await response.json();
			expect(response.status, `${scheduledTime}: ${JSON.stringify(body)}`).toBe(
				200
			);
		}
		expect(await (await beta.fetch("http://localhost")).json()).toEqual([
			expect.objectContaining({ scheduledTime: 1_788_883_200_000 }),
			...epochCases.map((scheduledTime) =>
				expect.objectContaining({ scheduledTime })
			),
		]);

		for (const scheduledTime of [-9_223_372_036_854, 9_223_372_036_854]) {
			response = await mf.dispatchFetch(
				...scheduledRequest("beta", {
					cron: "valid-scheduled-time-boundary",
					scheduled_time: scheduledTime,
				})
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				success: true,
				result: { outcome: "ok" },
			});
		}

		response = await mf.dispatchFetch(
			...scheduledRequest("exception", { cron: "* * * * *" })
		);
		const exceptionBody = await response.json();
		expect(response.status).toBe(200);
		expect(exceptionBody).toMatchObject({
			success: true,
			result: { outcome: "exception", noRetry: false },
		});

		response = await mf.dispatchFetch(
			...scheduledRequest("wait-until", { cron: "* * * * *" })
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			result: { outcome: "ok", noRetry: true },
		});
		const waitUntilWorker = await mf.getWorker("wait-until");
		expect(
			await (await waitUntilWorker.fetch("http://localhost")).json()
		).toEqual(["started", "waited"]);

		response = await mf.dispatchFetch(
			...scheduledRequest("wait-until", { cron: "reject-waitUntil" })
		);
		const rejectedWaitUntil = await response.json();
		expect(response.status).toBe(200);
		expect(rejectedWaitUntil).toMatchObject({
			success: true,
			result: { outcome: "exception", noRetry: true },
		});
	});

	test("validates the worker, cron, and scheduled time", async ({ expect }) => {
		const registryPath = await useTmp();
		const mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2026-01-01",
						manifest: workerManifest("worker"),
					},
				},
			],
		});
		useDispose(mf);
		await mf.ready;

		for (const [url, body] of [
			[BASE_URL, { cron: "* * * * *" }],
			[`${BASE_URL}?worker=worker`, { cron: "   " }],
			[
				`${BASE_URL}?worker=worker`,
				{ cron: "* * * * *", scheduled_time: 9_223_372_036_855 },
			],
			[
				`${BASE_URL}?worker=worker`,
				{ cron: "* * * * *", scheduled_time: -9_223_372_036_855 },
			],
			[`${BASE_URL}?worker=worker`, { cron: "* * * * *", scheduled_time: 1.5 }],
		] as const) {
			const response = await mf.dispatchFetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ code: 10001 })],
			});
		}
	});

	test("targets a peer owner once and rejects missing or stale ownership", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		function createInstance(name: string): Miniflare {
			return new Miniflare({
				inspectorPort: 0,
				unsafeLocalExplorer: true,
				unsafeDevRegistryPath: registryPath,
				workers: [
					{
						dev: { unsafeRegisterWorker: true },
						config: {
							type: "worker",
							name,
							compatibilityDate: "2026-01-01",
							manifest: workerManifest(name),
						},
					},
				],
			});
		}
		const owner = createInstance("owner");
		const peer = createInstance("peer");
		useDispose(owner);
		useDispose(peer);
		await Promise.all([owner.ready, peer.ready]);
		await waitForWorkersInRegistry(registryPath, ["owner", "peer"]);

		let response = await owner.dispatchFetch(
			...scheduledRequest("peer", { cron: "*/5 * * * *", scheduled_time: 123 })
		);
		const peerResponseBody = await response.json();
		expect(response.status, JSON.stringify(peerResponseBody)).toBe(200);
		expect(peerResponseBody).toMatchObject({
			result: { outcome: "ok", noRetry: true },
		});
		const peerWorker = await peer.getWorker("peer");
		expect(await (await peerWorker.fetch("http://localhost")).json()).toEqual([
			expect.objectContaining({ cron: "*/5 * * * *", scheduledTime: 123 }),
		]);

		response = await owner.dispatchFetch(
			...scheduledRequest("missing", { cron: "* * * * *" })
		);
		expect(response.status).toBe(404);
		await response.text();

		response = await owner.dispatchFetch(
			...scheduledRequest(
				"peer",
				{ cron: "* * * * *" },
				{ [NO_AGGREGATE_HEADER]: "true" }
			)
		);
		expect(response.status).toBe(502);
		await response.text();

		// A forwarded request must re-check registry ownership, even when the
		// receiving instance still has a locally configured Worker with that name.
		writeFileSync(
			path.join(registryPath, "owner"),
			JSON.stringify({
				debugPortAddress: "127.0.0.1:1",
				defaultEntrypointService: "owner",
				userWorkerService: "owner",
				instanceId: "new-owner",
			})
		);
		response = await owner.dispatchFetch(
			...scheduledRequest(
				"owner",
				{ cron: "stale-forward" },
				{ [NO_AGGREGATE_HEADER]: "true" }
			)
		);
		expect(response.status).toBe(502);
		await response.text();
		const ownerWorker = await owner.getWorker("owner");
		expect(await (await ownerWorker.fetch("http://localhost")).json()).toEqual(
			[]
		);

		const unavailableWorker = "unavailable";
		writeFileSync(
			path.join(registryPath, unavailableWorker),
			JSON.stringify({
				debugPortAddress: "127.0.0.1:1",
				defaultEntrypointService: unavailableWorker,
				userWorkerService: unavailableWorker,
				instanceId: "stale-owner",
			})
		);
		response = await owner.dispatchFetch(
			...scheduledRequest(unavailableWorker, { cron: "* * * * *" })
		);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			success: false,
			errors: [expect.objectContaining({ code: 10000 })],
		});

		response = await owner.dispatchFetch(
			...scheduledRequest("still-missing", { cron: "* * * * *" })
		);
		expect(response.status).toBe(404);
		await response.text();
	});

	test("captures the selected same-instance Worker in Observability", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		const mf = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeObservability: true,
			unsafeDevRegistryPath: registryPath,
			workers: ["alpha", "beta"].map((name) => ({
				dev: { unsafeRegisterWorker: true },
				config: {
					type: "worker",
					name,
					compatibilityDate: "2026-01-01",
					manifest: workerManifest(name),
				},
			})),
		});
		useDispose(mf);
		await mf.ready;
		await waitForWorkersInRegistry(registryPath, ["alpha", "beta"]);

		const dispatch = await mf.dispatchFetch(
			...scheduledRequest("beta", { cron: "* * * * *", scheduled_time: 0 })
		);
		expect(dispatch.status).toBe(200);
		await dispatch.text();

		let capturedServices: string[] = [];
		for (let attempt = 0; attempt < 20; attempt++) {
			const response = await mf.dispatchFetch(
				`http://localhost${CorePaths.EXPLORER}/api/local/observability/query`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sql: "SELECT DISTINCT service FROM spans WHERE service IN ('alpha', 'beta') AND outcome IS NOT NULL",
					}),
				}
			);
			const data = (await response.json()) as {
				result?: { columns?: string[]; rows?: unknown[][] };
			};
			const serviceIndex = data.result?.columns?.indexOf("service") ?? -1;
			capturedServices = (data.result?.rows ?? [])
				.map((row) => row[serviceIndex])
				.filter((service): service is string => typeof service === "string");
			if (capturedServices.includes("beta")) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		expect(capturedServices).toContain("beta");
		expect(capturedServices).not.toContain("alpha");
	});

	test("validates peer envelopes and preserves supported responses", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		const explorer = new Miniflare({
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name: "explorer",
						compatibilityDate: "2026-01-01",
						manifest: workerManifest("explorer"),
					},
				},
			],
		});
		const unrelated = new Miniflare({
			inspectorPort: 0,
			unsafeDevRegistryPath: registryPath,
			workers: ["unrelated", "future", "failure-500", "failure-502"].map(
				(name, index) => ({
					dev: { unsafeRegisterWorker: true },
					config: {
						type: "worker",
						name,
						compatibilityDate: "2026-01-01",
						manifest: singleModuleManifest(`
							export default {
								fetch(request) {
									const worker = new URL(request.url).searchParams.get("worker");
									if (worker === "future") {
										return Response.json({ success: true, errors: [], messages: [], result: { outcome: "ok", noRetry: false, futureField: "retained" } });
									}
									if (worker === "failure-500" || worker === "failure-502") {
										const status = worker === "failure-500" ? 500 : 502;
										return Response.json({ success: false, errors: [{ code: ${index} + 20000, message: worker }], messages: [], result: null }, { status });
									}
									return Response.json({ unrelated: true });
								}
							};
						`),
					},
				})
			),
		});
		useDispose(explorer);
		useDispose(unrelated);
		await Promise.all([explorer.ready, unrelated.ready]);
		await waitForWorkersInRegistry(registryPath, [
			"explorer",
			"unrelated",
			"future",
			"failure-500",
			"failure-502",
		]);

		const response = await explorer.dispatchFetch(
			...scheduledRequest("unrelated", { cron: "* * * * *" })
		);
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			success: false,
			errors: [expect.objectContaining({ code: 10000 })],
		});

		for (const [worker, status] of [
			["failure-500", 500],
			["failure-502", 502],
		] as const) {
			const failure = await explorer.dispatchFetch(
				...scheduledRequest(worker, { cron: "* * * * *" })
			);
			expect(failure.status).toBe(status);
			expect(await failure.json()).toMatchObject({
				success: false,
				errors: [expect.objectContaining({ message: worker })],
			});
		}

		const future = await explorer.dispatchFetch(
			...scheduledRequest("future", { cron: "* * * * *" })
		);
		expect(future.status).toBe(200);
		expect(await future.json()).toMatchObject({
			success: true,
			result: {
				outcome: "ok",
				noRetry: false,
				futureField: "retained",
			},
		});
	});
});
