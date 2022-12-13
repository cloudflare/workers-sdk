// `./assets` dynamically imports `@cloudflare/pages-shared/environment-polyfills`.
// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
// augmentations that pollute the `import`-site's typing environment.
//
// This type is used in the main `wrangler` TypeScript project. We split it out
// into a separate file (rather than putting it in `./index.ts`) so that
// `import`ing it doesn't bring in the `global` augmentations.
export interface EnablePagesAssetsServiceBindingOptions {
	proxyPort?: number;
	directory?: string;
}
