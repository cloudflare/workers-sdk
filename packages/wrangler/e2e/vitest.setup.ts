/* eslint-disable @typescript-eslint/no-empty-object-type */
import { expect } from "vitest";

interface CustomMatchers {
	toContainMatchingObject: (expected: object) => unknown;
}

declare module "vitest" {
	interface Assertion extends CustomMatchers {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
	// Extend vitest's expect object so that it has our new matcher
	toContainMatchingObject(received: object[], expected: object) {
		// const matcher = createMatcher(expected);
		const pass = received.some((item) => isSubset(expected, item));

		return {
			message: () => `Entry was${this.isNot ? "" : " not"} found in array.`,
			pass,
			actual: received,
			expected: expected,
		};

		function isSubset(subset: object, superset: object) {
			// Leverage the existing toMatchObject() behaviour to do the deep matching
			try {
				expect(superset).toMatchObject(subset);
				return true;
			} catch {
				return false;
			}
		}
	},
});
