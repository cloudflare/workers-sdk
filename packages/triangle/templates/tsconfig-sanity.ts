// @ts-nocheck `@types/node` should NOT be included
Buffer.from("test");

// @ts-expect-error `@types/jest` should NOT be included
test("test");

// `@cloudflare/workers-types` should be included
const _handler: ExportedHandler = {};
new HTMLRewriter();

export {};
