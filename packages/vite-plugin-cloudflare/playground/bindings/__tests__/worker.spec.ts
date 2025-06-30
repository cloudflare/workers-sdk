import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("kv_namspaces support", async () => {
	const response = await getTextResponse("/kv");
	expect(response).toBe("KV binding works");
});

test("unsafe_hello_world support", async () => {
	const response = await getTextResponse("/hello-world");
	expect(response).toBe("Hello World binding works");
});
