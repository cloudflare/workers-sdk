import { RpcTarget } from "cloudflare:workers";
import { z } from "zod";
import type { ResolvedStepConfig } from "./context";

const WorkflowSubscriptionEventCommonSchema = z.object({
	instanceId: z.string(),
	eventId: z.number(),
	timestamp: z.number(),
});
const StepDurationSchema = z.custom<ResolvedStepConfig["timeout"]>(
	(value) =>
		typeof value === "number" ||
		(typeof value === "string" &&
			/^[0-9]+ (second|minute|hour|day|week|month|year)s?$/.test(value))
);
const ResolvedStepDelaySchema = z.union([
	StepDurationSchema,
	z.literal("[dynamic]"),
]);
const ResolvedStepConfigSchema: z.ZodType<ResolvedStepConfig> = z.object({
	retries: z.object({
		limit: z.union([z.number(), z.literal(Infinity)]),
		delay: ResolvedStepDelaySchema,
		backoff: z.enum(["constant", "linear", "exponential"]).optional(),
	}),
	timeout: StepDurationSchema,
	sensitive: z.literal("output").optional(),
});

/**
 * Parses a resolved step config read from persisted local Workflow state.
 *
 * @param value Persisted value to parse.
 * @returns The resolved config, or `undefined` when the value is invalid.
 */
export function parseResolvedStepConfig(value: unknown) {
	const result = ResolvedStepConfigSchema.safeParse(value);
	return result.success ? result.data : undefined;
}
const WorkflowSubscriptionEventSchema = z.discriminatedUnion("type", [
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("workflow_queued"),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("workflow_started"),
		params: z.unknown().optional(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("workflow_completed"),
		output: z.unknown().optional(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("workflow_failed"),
		error: z.object({ name: z.string(), message: z.string() }),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("workflow_terminated"),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("step_started"),
		stepName: z.string(),
		config: ResolvedStepConfigSchema.optional(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("step_completed"),
		stepName: z.string(),
		output: z.unknown().optional(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("step_failed"),
		stepName: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("attempt_started"),
		stepName: z.string(),
		attempt: z.number(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("attempt_completed"),
		stepName: z.string(),
		attempt: z.number(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("attempt_failed"),
		stepName: z.string(),
		attempt: z.number(),
		retryDelayMs: z.number().optional(),
		error: z.object({ name: z.string(), message: z.string() }),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("sleep_started"),
		stepName: z.string(),
		durationMs: z.number(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("sleep_completed"),
		stepName: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("wait_started"),
		stepName: z.string(),
		eventType: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("wait_completed"),
		stepName: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("wait_timed_out"),
		stepName: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_started"),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_step_started"),
		stepName: z.string(),
		config: ResolvedStepConfigSchema.optional(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_step_completed"),
		stepName: z.string(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_step_failed"),
		stepName: z.string(),
		error: z.object({ name: z.string(), message: z.string() }),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_attempt_started"),
		stepName: z.string(),
		attempt: z.number(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_attempt_completed"),
		stepName: z.string(),
		attempt: z.number(),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_attempt_failed"),
		stepName: z.string(),
		attempt: z.number(),
		retryDelayMs: z.number().optional(),
		error: z.object({ name: z.string(), message: z.string() }),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_completed"),
	}),
	WorkflowSubscriptionEventCommonSchema.extend({
		type: z.literal("rollback_failed"),
	}),
]);

export type WorkflowSubscriptionEvent = z.infer<
	typeof WorkflowSubscriptionEventSchema
>;

const workflowSubscriptionEventTypeNames = new Set(
	WorkflowSubscriptionEventSchema.options.map(
		(option) => option.shape.type.value
	)
);
const WorkflowSubscriptionEventTypeSchema = z.custom<
	WorkflowSubscriptionEvent["type"]
>(
	(value) =>
		typeof value === "string" &&
		workflowSubscriptionEventTypeNames.has(
			value as WorkflowSubscriptionEvent["type"]
		)
);

export type WorkflowSubscriptionOptions = {
	cursor?: number;
	filter?: WorkflowSubscriptionEvent["type"][];
};

const WORKFLOW_SUBSCRIPTION_OPTIONS_SCHEMA = z
	.object({
		cursor: z.number().int().nonnegative().optional(),
		filter: z.array(WorkflowSubscriptionEventTypeSchema).optional(),
	})
	.strict();

export function parseWorkflowSubscriptionOptions(options: unknown) {
	if (options === undefined) {
		return {} satisfies WorkflowSubscriptionOptions;
	}

	const parsed = WORKFLOW_SUBSCRIPTION_OPTIONS_SCHEMA.safeParse(options);
	if (!parsed.success) {
		throw new Error("Invalid Workflow subscription options");
	}

	return parsed.data satisfies WorkflowSubscriptionOptions;
}

export type WorkflowSubscriptionState = {
	instanceId: string;
	params: unknown;
	lastEventId: number;
	filter: ReadonlySet<WorkflowSubscriptionEvent["type"]> | undefined;
	waiter: { resolve: () => void } | undefined;
	closed: boolean;
};

export interface WorkflowSubscription extends Disposable {
	next(): Promise<IteratorResult<WorkflowSubscriptionEvent, undefined>>;
}

export function isTerminalEvent(event: WorkflowSubscriptionEvent): boolean {
	return (
		event.type === "workflow_completed" ||
		event.type === "workflow_failed" ||
		event.type === "workflow_terminated"
	);
}

export class WorkflowSubscriptionTarget
	extends RpcTarget
	implements WorkflowSubscription
{
	readonly #nextEvent: () => Promise<
		IteratorResult<WorkflowSubscriptionEvent, undefined>
	>;
	readonly #onClose: () => void;
	#nextRequest = Promise.resolve<unknown>(undefined);
	#closed = false;

	constructor(
		nextEvent: () => Promise<
			IteratorResult<WorkflowSubscriptionEvent, undefined>
		>,
		onClose: () => void
	) {
		super();
		this.#nextEvent = nextEvent;
		this.#onClose = onClose;
	}

	async next(): Promise<IteratorResult<WorkflowSubscriptionEvent, undefined>> {
		if (this.#closed) {
			return { done: true, value: undefined };
		}

		const request = this.#nextRequest.then(async () => {
			if (this.#closed) {
				return { done: true, value: undefined } as const;
			}

			try {
				const result = await this.#nextEvent();
				if (result.done || isTerminalEvent(result.value)) {
					this.#finish();
				}
				return result;
			} catch (error) {
				this.#finish();
				throw error;
			}
		});
		this.#nextRequest = request;
		return request;
	}

	[Symbol.dispose](): void {
		this.#finish();
	}

	#finish(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#onClose();
	}
}
