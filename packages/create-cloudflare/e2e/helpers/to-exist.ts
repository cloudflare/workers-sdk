import { existsSync } from "node:fs";
// eslint-disable-next-line no-restricted-imports -- We need to import `expect` from "vitest" so that we can extend it
import { expect } from "vitest";

declare module "vitest" {
	interface CustomMatchers<R = unknown> {
		toExist(): R;
	}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required by vitest's module augmentation pattern
	interface Matchers<R> extends CustomMatchers<R> {}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required by vitest's module augmentation pattern
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
