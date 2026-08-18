import { test, describe } from "vitest";
import "../base-tests";
import { isBuild, viteTestUrl } from "../../../__test-utils__";

describe("assets-only", () => {
	test.runIf(isBuild)(
		"does not return a server rendered response at /hello after the build",
		async ({ expect }) => {
			const response = await fetch(`${viteTestUrl}/hello`);
			expect(response.status).toBe(404);
		}
	);
});
