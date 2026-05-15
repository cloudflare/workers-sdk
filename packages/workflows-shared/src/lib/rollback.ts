import { InstanceEvent } from "../instance";
import type { Engine } from "../engine";
import type { WorkflowStepConfig } from "cloudflare:workers";

// `:` can't appear in user-step cacheKeys (sha1-hex + `-` only).
export const ROLLBACK_CACHE_KEY_PREFIX = "rollback:";

export type RollbackContext = {
	error: Error;
	output: unknown;
	stepName: string;
};

// dup() to outlive the originating step.do call; Symbol.dispose locally
// (calling `.dispose()` would RPC to a non-existent remote method).
export type RollbackFn = ((ctx: RollbackContext) => Promise<void>) & {
	dup?: () => RollbackFn;
	[Symbol.dispose]?: () => void;
};

export type RollbackRegistryEntry = {
	fn: RollbackFn;
	stepName: string;
	output: unknown;
	config?: WorkflowStepConfig;
};

// Fail-fast: don't block the terminal transition on flaky rollbacks.
// Users can override via the rollbackConfig step option.
const DEFAULT_ROLLBACK_CFG: WorkflowStepConfig = {
	retries: { limit: 0, delay: 0, backoff: "constant" },
};

export function dupRollbackStub(fn: RollbackFn): RollbackFn {
	return fn.dup ? fn.dup() : fn;
}

export function disposeRollbackStub(fn: RollbackFn): void {
	try {
		fn[Symbol.dispose]?.();
	} catch {
		// already disposed
	}
}

export function registerRollbackFn(
	registry: Map<string, RollbackRegistryEntry>,
	cacheKey: string,
	fn: RollbackFn,
	stepName: string,
	output: unknown,
	config?: WorkflowStepConfig
): void {
	const existing = registry.get(cacheKey);
	if (existing) disposeRollbackStub(existing.fn);
	registry.set(cacheKey, { fn: dupRollbackStub(fn), stepName, output, config });
}

export function clearRollbackRegistry(
	registry: Map<string, RollbackRegistryEntry>
): void {
	for (const e of registry.values()) disposeRollbackStub(e.fn);
	registry.clear();
}

// LIFO; halts on first failure. Goes through Context.do so each rollback
// inherits retries/timeouts/attempt-logging.
export async function executeRollbacks(
	engine: Engine,
	triggerError: Error
): Promise<{ ranAny: boolean; allSucceeded: boolean }> {
	if (engine.rollbackRegistry.size === 0)
		return { ranAny: false, allSucceeded: true };

	const entries = [...engine.rollbackRegistry.entries()].reverse();
	engine.rollbackRegistry.clear();

	engine.writeLog(InstanceEvent.ROLLBACK_START, null, null, {
		triggerError: { name: triggerError.name, message: triggerError.message },
		totalSteps: entries.length,
	});

	let allSucceeded = true;
	let completed = 0;
	let stoppedAt = entries.length;

	for (let i = 0; i < entries.length; i++) {
		const [cacheKey, entry] = entries[i]!;
		const ctx = engine.createRollbackContext({ cacheKey });
		try {
			await ctx.do(
				entry.stepName,
				entry.config ?? DEFAULT_ROLLBACK_CFG,
				async () => {
					await entry.fn({
						error: triggerError,
						output: entry.output,
						stepName: entry.stepName,
					});
				}
			);
			completed++;
		} catch {
			// Context.do already wrote ROLLBACK_STEP_FAILURE; halt the chain.
			allSucceeded = false;
			stoppedAt = i + 1;
			break;
		} finally {
			disposeRollbackStub(entry.fn);
		}
	}
	for (let i = stoppedAt; i < entries.length; i++)
		disposeRollbackStub(entries[i]![1].fn);

	engine.writeLog(
		allSucceeded
			? InstanceEvent.ROLLBACK_COMPLETE
			: InstanceEvent.ROLLBACK_FAILED,
		null,
		null,
		{ totalSteps: entries.length, completedSteps: completed }
	);
	return { ranAny: completed > 0, allSucceeded };
}
