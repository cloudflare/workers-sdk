import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("can return a reponse using `httpServerHandler` from `cloudflare:node`", async () => {
	expect(await getTextResponse()).toBe("Hello from an httpServerHandler");
});
