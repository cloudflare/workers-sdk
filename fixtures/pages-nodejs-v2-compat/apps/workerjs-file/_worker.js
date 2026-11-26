process.env.foo = "bar";

// Check that we don't get a build time error when assigning to globalThis.process.
globalThis.process = process;

export default {
	fetch() {
		return new Response(
			`_worker.js file, process: ${Object.keys(process).sort()}`
		);
	},
};
