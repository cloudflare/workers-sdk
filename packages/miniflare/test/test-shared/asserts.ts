/**
 * Type for error expectations in tests (similar to Ava's ThrowsExpectation)
 */
export interface ThrowsExpectation<T extends Error = Error> {
	instanceOf?: new (...args: any[]) => T;
	message?: string | RegExp;
	name?: string;
	code?: string;
}

export function escapeRegexpComponent(value: string): string {
	// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
