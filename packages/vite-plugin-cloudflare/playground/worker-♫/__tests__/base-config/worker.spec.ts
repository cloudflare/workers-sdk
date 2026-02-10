import { test, vi } from "vitest";
import {
	getTextResponse,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test("basic base config functionality and url restoration handling", async ({
	expect,
}) => {
	// We don't need to specify the `/custom-mount` path when calling getTextResponse because its part of the viteTestUrl already
	expect(viteTestUrl).toContain("/custom-mount");

	await vi.waitFor(
		async () => expect(await getTextResponse()).toEqual("Hello World!"),
		WAIT_FOR_OPTIONS
	);

	await vi.waitFor(
		async () =>
			expect(await getTextResponse("/a/b/c?path")).toEqual(
				"/custom-mount/a/b/c"
			),
		WAIT_FOR_OPTIONS
	);
});

test("`X-Forwarded-Host` header but on custom mount path", async ({
	expect,
}) => {
	const testUrl = new URL(viteTestUrl);
	await vi.waitFor(
		async () =>
			expect(await getTextResponse("/x-forwarded-host")).toEqual(testUrl.host),
		WAIT_FOR_OPTIONS
	);
});
