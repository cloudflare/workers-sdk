// Can't use an `interface` here as we expect this type to be passed via
// Miniflare's `bindings` option, which requires all values to be JSON-typed.
export type D1Migration = {
	name: string;
	queries: string[];
};
