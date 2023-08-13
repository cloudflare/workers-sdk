import { existsSync } from "fs";
import { expect } from "vitest";

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
