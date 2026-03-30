export class WorkflowTimeoutError extends Error {
	name = "WorkflowTimeoutError";
}

export class WorkflowInternalError extends Error {
	name = "WorkflowInternalError";
}

export class WorkflowFatalError extends Error {
	name = "WorkflowFatalError";

	toJSON() {
		return {
			name: this.name,
			message: this.message,
		};
	}
}

export class WorkflowError extends Error {
	name = "WorkflowError";
}

export function createWorkflowError(
	message: string,
	errorCode: string
): WorkflowError {
	return new WorkflowError(`(${errorCode}) ${message}`);
}

const ABORT_PREFIX = "Aborting engine:" as const;

export const ABORT_REASONS = {
	USER_PAUSE: `${ABORT_PREFIX} User called pause`,
	USER_RESTART: `${ABORT_PREFIX} User called restart`,
	USER_TERMINATE: `${ABORT_PREFIX} User called terminate`,
	NON_RETRYABLE_ERROR: `${ABORT_PREFIX} A step threw a NonRetryableError`,
	NOT_SERIALISABLE: `${ABORT_PREFIX} Value is not serialisable`,
	GRACE_PERIOD_COMPLETE: `${ABORT_PREFIX} Grace period complete`,
} as const;

const ABORT_REASON_SET: ReadonlySet<string> = new Set(
	Object.values(ABORT_REASONS)
);

function getErrorMessage(e: unknown): string | undefined {
	if (e instanceof Error) {
		return e.message;
	}
	if (typeof e === "object" && e !== null) {
		const msg = (e as { message?: string }).message;
		if (typeof msg === "string") {
			return msg;
		}
	}
	return undefined;
}

export function isAbortError(e: unknown): boolean {
	const msg = getErrorMessage(e);
	return msg !== undefined && ABORT_REASON_SET.has(msg);
}

export function isUserTriggeredPause(e: unknown): boolean {
	return getErrorMessage(e) === ABORT_REASONS.USER_PAUSE;
}

export function isUserTriggeredRestart(e: unknown): boolean {
	return getErrorMessage(e) === ABORT_REASONS.USER_RESTART;
}

export function isUserTriggeredTerminate(e: unknown): boolean {
	return getErrorMessage(e) === ABORT_REASONS.USER_TERMINATE;
}
