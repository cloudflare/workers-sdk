import { test } from "vitest";
import { getTextResponse, isBuild } from "../../__test-utils__";

test("can import module from child environment", async ({ expect }) => {
	const response = await getTextResponse();
	expect(response).toBe("Hello from the child environment");
});

test("can import additional module from child environment", async ({
	expect,
}) => {
	const response = await getTextResponse("/additional-module");
	expect(response).toBe("Hello from a child environment additional module\n");
});

test.runIf(isBuild)(
	"serves an asset imported only by the child environment",
	async ({ expect }) => {
		const assetUrl = await getTextResponse("/imported-asset");
		expect(await getTextResponse(assetUrl)).toBe(
			"Asset imported by the entry Worker's child environment\n"
		);
	}
);
