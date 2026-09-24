import { describe, it } from "vitest";
import { isBun } from "../../utils/is-bun";

describe("isBun", () => {
	it("detects whether Bun is the current runtime", ({ expect }) => {
		const originalBunVersion = process.versions.bun;

		try {
			process.versions.bun = undefined;
			expect(isBun()).toBe(false);

			process.versions.bun = "1.4.2";
			expect(isBun()).toBe(true);
		} finally {
			process.versions.bun = originalBunVersion;
		}
	});
});
