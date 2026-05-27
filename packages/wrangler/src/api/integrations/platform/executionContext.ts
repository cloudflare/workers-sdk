export class ExecutionContext {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars -- Matches the Workers runtime ExecutionContext API signature
	waitUntil(promise: Promise<any>): void {
		if (!(this instanceof ExecutionContext)) {
			throw new Error("Illegal invocation");
		}
	}
	passThroughOnException(): void {
		if (!(this instanceof ExecutionContext)) {
			throw new Error("Illegal invocation");
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches the Workers runtime ExecutionContext API signature
	props: any = {};
}
