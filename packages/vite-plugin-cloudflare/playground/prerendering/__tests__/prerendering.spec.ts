import { test, describe } from "vitest";
import "./base-tests";
import {
	satisfiesMinimumViteVersion,
	isBuild,
	viteTestUrl,
} from "../../__test-utils__";

describe.runIf(satisfiesMinimumViteVersion("7.0.0"))("with-ssr", () => {
	test.runIf(isBuild)(
		"returns a server rendered response at /hello after the build",
		async ({ expect }) => {
			const response = await fetch(`${viteTestUrl}/hello`);
			expect(response.status).toBe(200);
		}
	);
});
