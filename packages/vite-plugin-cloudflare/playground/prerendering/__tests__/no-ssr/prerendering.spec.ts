import { test, describe } from "vitest";
import "../base-tests";
import {
	satisfiesViteVersion,
	isBuild,
	viteTestUrl,
} from "../../../__test-utils__";

describe.runIf(satisfiesViteVersion("7.0.0"))("no-ssr", () => {
	test.runIf(isBuild)(
		"does not return a server rendered response at /hello after the build",
		async ({ expect }) => {
			const response = await fetch(`${viteTestUrl}/hello`);
			expect(response.status).toBe(404);
		}
	);
});
