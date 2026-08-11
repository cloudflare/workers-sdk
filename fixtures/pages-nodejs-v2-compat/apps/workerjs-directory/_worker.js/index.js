process.env.foo = "bar";

// Check that we don't get a build time error when assigning to globalThis.process.
// @ts-expect-error `@cloudflare/workers-types` declares `process` as a `const`, so
// TypeScript does not treat it as a property of `globalThis`, but this is valid at runtime.
globalThis.process = process;

export default {
	fetch() {
		return new Response(
			`_worker.js directory, process: ${Object.keys(process).sort()}`
		);
	},
};
