import assert from "node:assert";
import path from "node:path";
import type { Metafile } from "esbuild";

/**
 * Compute entry-point information such as path, exports and dependencies
 * from the output of esbuild.
 */
export function getEntryPointFromSimpleMetafile(
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

/**
 * Compute entry-point information such as path, exports and dependencies
 * from the output of esbuild.
 */
export function getEntryPointFromSplitBundleMetafile(
	entryFile: string,
	entryDirectory: string,
	metafile: Metafile
) {
	const relativeEntryFile = path.relative(
		entryDirectory,
		// we use require.resolve to get the absolute path to the entry file
		// including an extension if it wasn't specified
		require.resolve(entryFile, { paths: [entryDirectory] })
	);

	const entryPointDetails = Object.entries(metafile.outputs).find(
		([_output, { entryPoint }]) => {
			if (entryPoint) {
				return entryPoint === relativeEntryFile;
			}
			return false;
		}
	);

	if (!entryPointDetails) {
		throw new Error(
			`Cannot find entry-point "${entryFile}" in generated bundle.`
		);
	}

	// console.log("entryPointDetails", entryPointDetails);
	return {
		relativePath: entryPointDetails[0],
		exports: entryPointDetails[1].exports,
		dependencies: entryPointDetails[1].inputs,
	};
}
