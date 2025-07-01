import { existsSync } from "fs";
import { expect } from "vitest";

declare module "vitest" {
	interface CustomMatchers<R = unknown> {
		toExist(): R;
	}
	interface Assertion<T> extends CustomMatchers<T> {}
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
