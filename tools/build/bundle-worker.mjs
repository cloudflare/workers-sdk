import { rolldown } from "rolldown";

/**
 * Bundle an embedded Worker without sharing chunks with other Workers.
 *
 * @param {import("rolldown").InputOptions} input
 * @param {import("rolldown").OutputOptions} [output]
 * @returns {Promise<{code: string, watchFiles: string[]}>}
 */
export async function bundleWorker(input, output = {}) {
	const bundle = await rolldown({
		platform: "node",
		resolve: { conditionNames: ["workerd", "worker", "browser"] },
		external: [/^(cloudflare|workerd|node-internal):/],
		...input,
	});
	try {
		const options = {
			format: "esm",
			codeSplitting: false,
			...output,
		};
		const result = output.file
			? await bundle.write(options)
			: await bundle.generate(options);
		const chunks = result.output.filter((chunk) => chunk.type === "chunk");
		if (chunks.length !== 1 || chunks[0] === undefined) {
			throw new Error("Expected one standalone embedded Worker bundle");
		}
		return { code: chunks[0].code, watchFiles: await bundle.watchFiles };
	} finally {
		await bundle.close();
	}
}
