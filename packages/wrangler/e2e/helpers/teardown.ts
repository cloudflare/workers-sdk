import { afterEach } from "vitest";

const teardownCallbacks: (() => unknown | Promise<unknown>)[] = [];
export function teardown(callback: () => unknown | Promise<unknown>) {
	// `unshift()` so teardown callbacks executed in reverse
	teardownCallbacks.unshift(callback);
}

function getErrorStack(e: unknown): string {
	if (
		typeof e === "object" &&
		e !== null &&
		"stack" in e &&
		typeof e.stack === "string"
	) {
		return e.stack;
	} else {
		return String(e);
	}
}

afterEach(async () => {
	const errors: unknown[] = [];
	for (const callback of teardownCallbacks.splice(0)) {
		try {
			await callback();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0)
		throw new AggregateError(
			errors,
			["Unable to teardown:", ...errors.map(getErrorStack)].join("\n")
		);
});
