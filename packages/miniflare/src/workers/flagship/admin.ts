import type {
	EvaluationContext,
	EvaluationDetails,
	FlagValue,
} from "./evaluate";
import type { Flag, FlagInput } from "./flags";

/**
 * Management API for a local flag store.
 *
 * Declared apart from the binding worker so that Node-side code can reference
 * it without pulling in the `cloudflare:workers` runtime types.
 */
export interface FlagshipAdmin {
	listFlags(): Promise<Flag[]>;
	getFlag(flagKey: string): Promise<Flag>;
	/** Account tag seeding rollout bucketing, or `null` if the store is unseeded. */
	getAccountTag(): Promise<string | null>;
	/** Seed rollout bucketing so local buckets match the remote app's. */
	setAccountTag(accountTag: string): Promise<void>;
	createFlag(input: FlagInput): Promise<Flag>;
	updateFlag(flagKey: string, input: FlagInput): Promise<Flag>;
	putFlag(input: FlagInput): Promise<Flag>;
	deleteFlag(flagKey: string): Promise<void>;
	evaluateFlag(
		flagKey: string,
		context?: EvaluationContext
	): Promise<EvaluationDetails<FlagValue>>;
}
