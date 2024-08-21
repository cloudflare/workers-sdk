process.env.foo = "bar";

// Check that we don't get a build time error when assigning to globalThis.process.
globalThis.process = process;

export const onRequest = () => {
	return new Response(
		`Pages functions, process: ${Object.keys(process).sort()}`
	);
};
