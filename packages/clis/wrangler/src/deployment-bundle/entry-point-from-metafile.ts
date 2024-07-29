import assert from "node:assert";
import type { Metafile } from "esbuild";

/**
 * Compute entry-point information such as path, exports and dependencies
 * from the output of esbuild.
 */
export function getEntryPointFromMetafile(
	entryFile: string,
	metafile: Metafile
) {
	const entryPoints = Object.entries(metafile.outputs).filter(
		([_path, output]) => output.entryPoint !== undefined
	);
	if (entryPoints.length !== 1) {
		const entryPointList = entryPoints
			.map(([_input, output]) => output.entryPoint)
			.join("\n");
		assert(
			entryPoints.length > 0,
			`Cannot find entry-point "${entryFile}" in generated bundle.\n${entryPointList}`
		);
		assert(
			entryPoints.length < 2,
			`More than one entry-point found for generated bundle.\n${entryPointList}`
		);
	}

	const [relativePath, entryPoint] = entryPoints[0];

	return {
		relativePath,
		exports: entryPoint.exports,
		dependencies: entryPoint.inputs,
	};
}
