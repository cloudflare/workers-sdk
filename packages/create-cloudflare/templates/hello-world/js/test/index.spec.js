import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("Hello World worker", () => {
  it("displays Hello World! (unit style)", async () => {
    const request = new Request("http://example.com");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
  });

  it("displays Hello World! (integration style)", async () => {
   const response = await SELF.fetch(request, env, ctx);
   expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
 });
});
