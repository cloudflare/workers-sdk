import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "./test-shared";

/**
 * Counts `ESTABLISHED` TCP sockets held by every `workerd` process on this
 * machine, by walking `/proc`. Only available on Linux.
 */
function countEstablishedWorkerdSockets(): number {
	const socketStates = new Map<string, string>();
	for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
		let contents: string;
		try {
			contents = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		for (const line of contents.split("\n").slice(1)) {
			const parts = line.trim().split(/\s+/);
			if (parts.length < 4) {
				continue;
			}
			socketStates.set(parts[9], parts[3]);
		}
	}
	let count = 0;
	for (const pid of readdirSync("/proc").filter((entry) =>
		/^\d+$/.test(entry)
	)) {
		let cmdline: string;
		try {
			cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
		} catch {
			continue;
		}
		if (!cmdline.includes("workerd")) {
			continue;
		}
		let fds: string[];
		try {
			fds = readdirSync(`/proc/${pid}/fd`);
		} catch {
			continue;
		}
		for (const fd of fds) {
			let link: string;
			try {
				link = readlinkSync(`/proc/${pid}/fd/${fd}`);
			} catch {
				continue;
			}
			const match = link.match(/^socket:\[(\d+)\]$/);
			if (match !== null && socketStates.get(match[1]) === "01") {
				count++;
			}
		}
	}
	return count;
}

// https://github.com/cloudflare/workers-sdk/issues/16689
// A stub-less object result of an RPC call forwarded across the dev registry
// must behave like the same result from a local entrypoint: no injected
// `Symbol.dispose`, and no cross-process connection held open until the
// caller's request ends.
describe("DevRegistry RPC result sessions", () => {
	test("stub-less object results of cross-instance RPC calls are not disposable", async ({
		expect,
	}) => {
		const unsafeDevRegistryPath = await useTmp();
		const caller = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					config: {
						name: "caller-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
						export default {
							async fetch(request, env) {
								const url = new URL(request.url);
								if (url.pathname === "/ready") {
									return new Response(String(await env.DATA_SERVICE.get5()));
								}
								if (url.pathname === "/inspect") {
									const result = await env.DATA_SERVICE.getSomething();
									return Response.json({
										hasOwnDispose: Object.prototype.hasOwnProperty.call(
											result,
											Symbol.dispose
										),
										name: result.name,
									});
								}
								const mode = url.searchParams.get("mode") ?? "object-keep";
								const n = Number(url.searchParams.get("n") ?? 50);
								const hold = Number(url.searchParams.get("hold") ?? 0);
								const kept = [];
								for (let i = 0; i < n; i++) {
									if (mode === "primitive") {
										kept.push(await env.DATA_SERVICE.get5());
									} else {
										kept.push(await env.DATA_SERVICE.getSomething());
									}
								}
								if (hold) {
									await new Promise((resolve) => setTimeout(resolve, hold));
								}
								return new Response(\`\${mode} \${n} kept=\${kept.length}\`);
							}
						}
						`),
						env: {
							DATA_SERVICE: {
								type: "worker",
								worker: "callee-worker",
								exportName: "DataService",
							},
						},
					},
				},
			],
		});
		useDispose(caller);

		const callee = new Miniflare({
			unsafeDevRegistryPath,
			workers: [
				{
					dev: { unsafeRegisterWorker: true },
					config: {
						name: "callee-worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(`
						import { WorkerEntrypoint } from "cloudflare:workers";
						export class DataService extends WorkerEntrypoint {
							async getSomething() { return { name: "hello" }; }
							async get5() { return 5; }
						}
						export default { fetch() { return new Response("callee"); } }
						`),
					},
				},
			],
		});
		useDispose(callee);
		await callee.ready;

		// Wait until the callee is visible to the caller through the registry.
		await vi.waitFor(
			async () => {
				const res = await caller.dispatchFetch("http://placeholder/ready");
				expect(await res.text()).toBe("5");
			},
			{ timeout: 10_000, interval: 100 }
		);

		const res = await caller.dispatchFetch("http://placeholder/inspect");
		const body = await res.json();
		expect(body).toEqual({ hasOwnDispose: false, name: "hello" });
	});

	// Every undisposed stub-less object result currently keeps the call's
	// debug-port tunnel open, two TCP connections per call, until the caller's
	// request ends. Counted on Linux, where /proc exposes the sockets.
	test.skipIf(process.platform !== "linux")(
		"undisposed stub-less object results do not hold cross-process connections",
		async ({ expect }) => {
			const unsafeDevRegistryPath = await useTmp();
			const caller = new Miniflare({
				unsafeDevRegistryPath,
				workers: [
					{
						config: {
							name: "caller-worker",
							compatibilityDate: "2025-05-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(`
							export default {
								async fetch(request, env) {
									const url = new URL(request.url);
									const mode = url.searchParams.get("mode") ?? "object-keep";
									const n = Number(url.searchParams.get("n") ?? 50);
									const hold = Number(url.searchParams.get("hold") ?? 0);
									const kept = [];
									for (let i = 0; i < n; i++) {
										if (mode === "primitive") {
											kept.push(await env.DATA_SERVICE.get5());
										} else {
											kept.push(await env.DATA_SERVICE.getSomething());
										}
									}
									if (hold) {
										await new Promise((resolve) => setTimeout(resolve, hold));
									}
									return new Response(\`\${mode} \${n} kept=\${kept.length}\`);
								}
							}
							`),
							env: {
								DATA_SERVICE: {
									type: "worker",
									worker: "callee-worker",
									exportName: "DataService",
								},
							},
						},
					},
				],
			});
			useDispose(caller);

			const callee = new Miniflare({
				unsafeDevRegistryPath,
				workers: [
					{
						dev: { unsafeRegisterWorker: true },
						config: {
							name: "callee-worker",
							compatibilityDate: "2025-05-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(`
							import { WorkerEntrypoint } from "cloudflare:workers";
							export class DataService extends WorkerEntrypoint {
								async getSomething() { return { name: "hello" }; }
								async get5() { return 5; }
							}
							export default { fetch() { return new Response("callee"); } }
							`),
						},
					},
				],
			});
			useDispose(callee);
			await callee.ready;

			// Warm up: 50 primitive results, request completed.
			await vi.waitFor(
				async () => {
					const res = await caller.dispatchFetch(
						"http://placeholder/?mode=primitive&n=50"
					);
					expect(await res.text()).toBe("primitive 50 kept=50");
				},
				{ timeout: 10_000, interval: 100 }
			);
			const baseline = countEstablishedWorkerdSockets();

			// 50 stub-less object results, dropped by the caller, request held
			// open: no connection should be held for the delivered results.
			const done = caller.dispatchFetch(
				"http://placeholder/?mode=object-keep&n=50&hold=4000"
			);
			await new Promise((resolve) => setTimeout(resolve, 1500));
			const during = countEstablishedWorkerdSockets();
			const res = await done;
			expect(await res.text()).toBe("object-keep 50 kept=50");
			await new Promise((resolve) => setTimeout(resolve, 500));
			const after = countEstablishedWorkerdSockets();

			// Two connections leak per undisposed result today, so `during` is
			// around `baseline + 200`. Delivered results should cost nothing.
			expect(during).toBeLessThan(baseline + 20);
			expect(after).toBeLessThan(baseline + 20);
		}
	);
});
