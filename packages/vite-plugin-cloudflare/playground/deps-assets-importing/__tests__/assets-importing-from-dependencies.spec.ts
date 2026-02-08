import { test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("it is possible to import assets from dependencies", async ({
	expect,
}) => {
	expect(await getTextResponse()).toMatch(
		/Hello! This is an application built using vite@[^ ]+? \(information retrieved from "[^"]+?\.json"\)/
	);
});
