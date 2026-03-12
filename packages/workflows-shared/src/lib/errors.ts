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
