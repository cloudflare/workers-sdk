import { expect, vi } from "vitest";

vi.mock("log-update");

expect.extend({
	toHaveBeenCalledFirstWith: (received, expected) => {
		const firstCall = received.mock.calls[0][0];

		for (let i = 0; i < expected.length; i++) {
			if (firstCall[i] !== expected[i]) {
				return {
					pass: false,
					message: () =>
						`AssertionError
Expected

  ${JSON.stringify(expected)}

to partially match first call of mock:

  ${JSON.stringify(firstCall)}

Failed on argument: "${firstCall[i]}" (expected "${expected[i]}")
`,
				};
			}
		}

		return {
			pass: true,
			message: () => "passed.",
		};
	},
});
