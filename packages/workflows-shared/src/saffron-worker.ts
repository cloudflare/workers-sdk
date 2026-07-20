import { WorkerEntrypoint } from "cloudflare:workers";
import { initSync, WasmCron } from "./vendor/saffron/saffron.js";
import wasmModule from "./vendor/saffron/saffron_bg.wasm";
import type { SaffronService } from "./lib/cron";

// Instantiate the vendored WASM once at load (workerd allows sync instantiation).
initSync({ module: wasmModule });

type CronRequest = Parameters<SaffronService["next_cron_occurrences"]>[0];
type CronResponse = Awaited<
	ReturnType<SaffronService["next_cron_occurrences"]>
>;

/** Saffron `next_cron_occurrences` RPC, backed by the vendored WASM. Embedded as
 * an internal service and bound as SAFFRON on the engine. */
export class CronFetcher extends WorkerEntrypoint implements SaffronService {
	async next_cron_occurrences(request: CronRequest): Promise<CronResponse> {
		const { expressions, count = 1, seed } = request;
		const after = seed ?? Date.now();
		const errors: { expression: string; error: string }[] = [];
		const occurrences: number[] = [];

		for (const expression of expressions) {
			let cron: WasmCron;
			try {
				cron = new WasmCron(expression);
			} catch (e) {
				errors.push({
					expression,
					error: e instanceof Error ? e.message : String(e),
				});
				continue;
			}
			try {
				let reference = after;
				for (let i = 0; i < count; i++) {
					const next = cron.nextAfter(reference);
					if (next === undefined) {
						break;
					}
					occurrences.push(next);
					reference = next;
				}
			} finally {
				cron.free();
			}
		}

		if (errors.length > 0) {
			return { valid: false, errors };
		}

		occurrences.sort((a, b) => a - b);
		return { valid: true, next_occurrences: occurrences.slice(0, count) };
	}
}
