import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("kv_namspaces support", async () => {
	const response = await getTextResponse("/kv");
	expect(response).toBe("KV binding works");
});

test("images support", async () => {
	const response = await getTextResponse("/images");
	expect(response).toBe("Images binding works");
});

test("unsafe_hello_world support", async () => {
	const response = await getTextResponse("/hello-world");
	expect(response).toBe("Hello World binding works");
});

test("analytics_engine support", async () => {
	const response = await getTextResponse("/ae");
	expect(response).toBe("AE binding works");
});

test("ratelimit support", async () => {
	const response = await getTextResponse("/rate-limit");
	expect(response).toBe("Rate limit binding works: first: true, second: false");
});

test("hyperdrive support", async () => {
	const response = await getTextResponse("/hyperdrive");
	expect(response).toBe("Hyperdrive binding works");
});
