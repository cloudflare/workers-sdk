import { existsSync } from "node:fs";
import { expect } from "vitest";

declare module "vitest" {
	interface CustomMatchers<R = unknown> {
		toExist(): R;
	}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface Assertion<T> extends CustomMatchers<T> {}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
	toExist: (received) => {
		const exists = existsSync(received);

		if (!exists) {
			return {
				message: () => `expected ${received} to exist on disk.`,
				pass: false,
			};
		}

		return { pass: true, message: () => "passed." };
	},
});
