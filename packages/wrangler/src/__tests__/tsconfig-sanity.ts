import { test } from "vitest";
// `@types/node` should be included
Buffer.from("test");

// Vitest should be included
test("test");

// @ts-expect-error `@cloudflare/workers-types` should NOT be included
const _handler: ExportedHandler = {};
// @ts-expect-error `@cloudflare/workers-types` should NOT be included
new HTMLRewriter();

export { };
