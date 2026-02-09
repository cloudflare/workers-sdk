import { test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("can return a response using `httpServerHandler` from `cloudflare:node`", async ({
	expect,
}) => {
	expect(await getTextResponse()).toBe("Hello from an httpServerHandler");
});
