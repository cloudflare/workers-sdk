import assert from "node:assert";
import path from "node:path";
import type { Metafile } from "esbuild";

/**
 * Compute entry-point information such as path, exports and dependencies
 * from the output of esbuild.
 */
export function getEntryPointFromMetafile(
	projectRoot: string,
	entryFile: string,
	metafile: Metafile
) {
	const entryFileRelativePath = path.relative(projectRoot, entryFile);

	const entryPoints = Object.entries(metafile.outputs).filter(
		([_path, output]) => output.entryPoint !== undefined
	);

	const entryPoint =
		entryPoints.length === 1
			? entryPoints[0]
			: entryPoints.find(
					([, output]) => output.entryPoint === entryFileRelativePath
				);

	if (!entryPoint) {
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
		throw new Error(
			`Cannot find entry-point "${entryFile}" in generated bundle.\n${entryPointList}`
		);
	}

	const [relativePath, output] = entryPoint;

	return {
		relativePath,
		exports: output.exports,
		dependencies: output.inputs,
	};
}
