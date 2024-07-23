// `./assets` dynamically imports`@cloudflare/pages-shared/environment-polyfills`.
// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
// augmentations that pollute the `import`-site's typing environment.
//
// We `require` instead of `import`ing here to avoid polluting the main
// `wrangler` TypeScript project with the `global` augmentations. This
// relies on the fact that `require` is untyped.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const generateASSETSBinding = require("./assets").default;
