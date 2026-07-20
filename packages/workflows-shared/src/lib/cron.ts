/** Saffron cron-parser RPC surface (via a service binding) **/
export interface SaffronService {
	next_cron_occurrences(request: {
		expressions: string[];
		count?: number;
		seed?: number | null;
	}): Promise<{
		valid: boolean;
		errors?: { expression: string; error: string }[];
		next_occurrences?: number[];
	}>;
}

export type CronMetadata = {
	expression: string;
	scheduledTime: number;
	autoSchedule?: boolean;
};

export type CronSeed = {
	accountId: number;
	workflowName: string;
	instanceId: string;
	params: Readonly<unknown>;
};

/** Next firing time (epoch ms) strictly after `after`, via saffron. Throws on an
 * invalid expression or no next occurrence. */
export async function getNextCronOccurrence(
	saffron: SaffronService,
	expression: string,
	after: number = Date.now()
): Promise<number> {
	const res = await saffron.next_cron_occurrences({
		expressions: [expression],
		count: 1,
		seed: after,
	});
	const next = res.next_occurrences?.[0];
	if (!res.valid || next === undefined) {
		throw new Error(
			`Invalid cron expression ${JSON.stringify(expression)}: ${
				res.errors?.[0]?.error ?? "no next occurrence"
			}`
		);
	}
	return next;
}

/** Deterministic per-firing instance id, so the seeder and the engine's chaining
 * resolve the same DO. */
export function getCronInstanceId(
	expression: string,
	scheduledTime: number
): string {
	return `${expression}-${scheduledTime}`;
}
