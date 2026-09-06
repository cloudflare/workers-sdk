import {
	createExecutionContext,
	env,
	SELF,
	waitOnExecutionContext,
} from "cloudflare:test";
import { it } from "vitest";
import worker from "../src/index";

it("exposes bindings declared in cloudflare.config.ts", ({ expect }) => {
	expect(env.MY_TEXT).toBe("from cloudflare.config.ts");
});

it("dispatches to the entrypoint declared in cloudflare.config.ts", async ({
	expect,
}) => {
	const response = await SELF.fetch("https://example.com");
	expect(await response.text()).toBe("from cloudflare.config.ts");
});

it("reads and writes the KV namespace", async ({ expect }) => {
	const response = await SELF.fetch("https://example.com/kv");
	expect(await response.text()).toBe("value");
	expect(await env.MY_KV.get("key")).toBe("value");
});

it("can unit test the handler directly", async ({ expect }) => {
	const ctx = createExecutionContext();
	const response = await worker.fetch(
		new Request("https://example.com"),
		env,
		ctx
	);
	await waitOnExecutionContext(ctx);
	expect(await response.text()).toBe("from cloudflare.config.ts");
});
