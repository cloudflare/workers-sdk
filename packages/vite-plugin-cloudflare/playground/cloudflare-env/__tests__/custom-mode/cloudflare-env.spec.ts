import { test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("returns the correct var when CLOUDFLARE_ENV is provided in a .env.[mode] file", async ({
	expect,
}) => {
	expect(await getTextResponse()).toEqual("Custom env var");
});
