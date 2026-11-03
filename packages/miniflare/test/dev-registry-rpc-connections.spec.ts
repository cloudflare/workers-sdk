import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { describe, test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "./test-shared";

// The bug in #16689 is observable through loopback TCP connections between
// the two workerd processes, which only /proc exposes per-socket. Skip
// elsewhere.
const canCountSockets = existsSync("/proc/net/tcp");

/**
 * Count the caller-side established TCP connections to the given loopback
 * port, by parsing `/proc/net/tcp`. Each socket appears twice in the table
 * (once per endpoint); only the caller's rows have the port as the remote
 * address, so they count each connection exactly once.
 */
function establishedConnectionsTo(address: string): number {
	const port = Number.parseInt(address.split(":")[1], 10);
	const portHex = port.toString(16).toUpperCase().padStart(4, "0");
	let count = 0;
	for (const line of readFileSync("/proc/net/tcp", "utf8").split("\n").slice(1)) {
		const columns = line.trim().split(/\s+/);
		// columns: local_address rem_address st ...
		if (columns.length < 4) continue;
		if (columns[1] === `0100007F:${portHex}` && columns[3] === "01") count++;
	}
	return count;
}

describe("DevRegistry RPC result sessions", () => {
	test.skipIf(!canCountSockets)(
		"an undisposed object result of a cross-process service binding RPC call does not hold its connection open",
		{ timeout: 60_000 },
		async ({ expect }) => {
			const unsafeDevRegistryPath = await useTmp();

			const remote = new Miniflare({
				unsafeDevRegistryPath,
				workers: [
					{
						dev: { unsafeRegisterWorker: true },
						config: {
							name: "remote-worker",
							compatibilityDate: "2025-05-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(`
								import { WorkerEntrypoint } from "cloudflare:workers";
								export class DataService extends WorkerEntrypoint {
									async getSomething() { return { name: "hello" }; }
									async get5() { return 5; }
								}
								export default { fetch() { return new Response("callee"); } };
							`),
						},
					},
				],
			});
			useDispose(remote);
			await remote.ready;

			// The callee's registry entry records the workerd debug port
			// address that cross-process service binding calls dial.
			const definitionPath = path.join(unsafeDevRegistryPath, "remote-worker");
			const debugPortAddress = await vi.waitFor(
				async () =>
					JSON.parse(readFileSync(definitionPath, "utf8")).debugPortAddress,
				{ timeout: 10_000, interval: 100 }
			);

			const local = new Miniflare({
				unsafeDevRegistryPath,
				workers: [
					{
						config: {
							name: "local-worker",
							compatibilityDate: "2025-05-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(`
								export default {
									async fetch(request, env) {
										const url = new URL(request.url);
										const mode = url.searchParams.get("mode");
										const n = Number(url.searchParams.get("n") ?? 10);
										const hold = Number(url.searchParams.get("hold") ?? 0);
										for (let i = 0; i < n; i++) {
											if (mode === "object-drop") {
												const { name } = await env.DATA_SERVICE.getSomething();
												if (name !== "hello") throw new Error("unexpected result");
											} else {
												if ((await env.DATA_SERVICE.get5()) !== 5) throw new Error("unexpected result");
											}
										}
										if (hold) await new Promise((resolve) => setTimeout(resolve, hold));
										return new Response(mode);
									}
								};
							`),
							env: {
								DATA_SERVICE: {
									type: "worker",
									worker: "remote-worker",
									exportName: "DataService",
								},
							},
						},
					},
				],
			});
			useDispose(local);

			// Wait for the registry entry of the callee to reach the caller.
			await vi.waitFor(
				async () => {
					const res = await local.dispatchFetch(
						"http://placeholder/?mode=primitive&n=1&hold=0"
					);
					expect(await res.text()).toBe("primitive");
				},
				{ timeout: 20_000, interval: 100 }
			);

			const HOLD_MS = 4_000;
			const settle = (ms: number) =>
				new Promise((resolve) => setTimeout(resolve, ms));

			// Calibrate: while a request holding only primitive results runs,
			// only a handful of connections to the callee's debug port are
			// established.
			const primitivePending = local.dispatchFetch(
				`http://placeholder/?mode=primitive&n=20&hold=${HOLD_MS}`
			);
			await settle(1_000);
			const primitiveDuringHold = establishedConnectionsTo(debugPortAddress);
			expect(await (await primitivePending).text()).toBe("primitive");

			await settle(1_000);

			// The reported bug: each object result the caller drops, rather
			// than disposes, holds its cross-process connection open for the
			// rest of the request, so 20 dropped object results hold roughly
			// 40 connections here, as many calls/s exhaust the ephemeral port
			// range in long-running requests.
			const objectDropPending = local.dispatchFetch(
				`http://placeholder/?mode=object-drop&n=20&hold=${HOLD_MS}`
			);
			await settle(1_000);
			const objectDropDuringHold = establishedConnectionsTo(debugPortAddress);
			expect(await (await objectDropPending).text()).toBe("object-drop");

			expect(objectDropDuringHold).toBeLessThanOrEqual(primitiveDuringHold + 6);
		}
	);
});
