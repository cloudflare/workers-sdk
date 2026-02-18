import { test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("returns the correct top-level var when CLOUDFLARE_ENV is undefined", async ({
	expect,
}) => {
	expect(await getTextResponse()).toEqual("Top level var");
});
