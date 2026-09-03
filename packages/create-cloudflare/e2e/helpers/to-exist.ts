import { existsSync } from "node:fs";
// eslint-disable-next-line no-restricted-imports -- We need to import `expect` from "vitest" so that we can extend it
import { expect } from "vitest";

declare module "vitest" {
	interface CustomMatchers<R> {
		toExist(): R;
	}
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required by vitest's module augmentation pattern
	interface Matchers<R, T> extends CustomMatchers<R> {}
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
