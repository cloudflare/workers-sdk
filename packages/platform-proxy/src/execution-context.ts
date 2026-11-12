/**
 * Stand-in for the `ctx` object a Worker receives. Its methods do nothing, because the code
 * using it runs in Node.js rather than in a Worker.
 */
export class ExecutionContext {
	// oxlint-disable-next-line typescript/no-explicit-any -- matches the Workers runtime signature
	waitUntil(_promise: Promise<any>): void {
		if (!(this instanceof ExecutionContext)) {
			throw new Error("Illegal invocation");
		}
	}

	passThroughOnException(): void {
		if (!(this instanceof ExecutionContext)) {
			throw new Error("Illegal invocation");
		}
	}

	// oxlint-disable-next-line typescript/no-explicit-any -- matches the Workers runtime type
	props: any = {};
}
