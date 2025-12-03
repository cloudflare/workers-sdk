// `@types/node` should be included
Buffer.from("test");

// @ts-expect-error `@cloudflare/workers-types` should NOT be included
const _handler: ExportedHandler = {};
// @ts-expect-error `@cloudflare/workers-types` should NOT be included
new HTMLRewriter();

export {};
