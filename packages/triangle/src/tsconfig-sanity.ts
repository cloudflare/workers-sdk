// `@types/node` should be included
Buffer.from("test");

// @ts-expect-error `@types/jest` should NOT be included
test("test");

// @ts-expect-error `@cloudflare/workers-types` should NOT be included
const _handler: ExportedHandler = {};
// @ts-expect-error `@cloudflare/workers-types` should NOT be included
new HTMLRewriter();

// @ts-expect-error `fetch` should NOT be included as our minimum supported
//  Node version is 16.13.0 which does not include `fetch` on the global scope
void fetch("http://localhost/");

export {};
