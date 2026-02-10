import type {
	DurableObject,
	WorkerEntrypoint,
	WorkflowEntrypoint,
} from "cloudflare:workers";

/** Keys that should be ignored during RPC property access */
export const IGNORED_KEYS = ["self"] as const;

/** Available methods for `WorkerEntrypoint` class */
export const WORKER_ENTRYPOINT_KEYS = [
	"email",
	"fetch",
	"queue",
	"tail",
	"tailStream",
	"test",
	"trace",
	"scheduled",
] as const;

/** Available methods for `DurableObject` class */
export const DURABLE_OBJECT_KEYS = [
	"alarm",
	"fetch",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
] as const;

/** Available methods for `WorkflowEntrypoint` classes */
export const WORKFLOW_ENTRYPOINT_KEYS = ["run"] as const;

/**
 * This function is not used.
 * It is is included to check that we have included all the necessary keys.
 */
// @ts-expect-error: function declaration only used to check types
function _checkExhaustiveKeys() {
	// Remove branded keys
	type UnbrandedKeys<T> = Exclude<keyof T, `__${string}_BRAND`>;

	const _workerEntrypointExhaustive: (typeof WORKER_ENTRYPOINT_KEYS)[number] =
		undefined as unknown as UnbrandedKeys<WorkerEntrypoint>;
	const _durableObjectExhaustive: (typeof DURABLE_OBJECT_KEYS)[number] =
		undefined as unknown as UnbrandedKeys<DurableObject>;
	const _workflowEntrypointExhaustive: (typeof WORKFLOW_ENTRYPOINT_KEYS)[number] =
		undefined as unknown as UnbrandedKeys<WorkflowEntrypoint>;

	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	_workerEntrypointExhaustive ||
		_durableObjectExhaustive ||
		_workflowEntrypointExhaustive;
}
