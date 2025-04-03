import { Blob } from "node:buffer";
import { gzipSync } from "node:zlib";
import chalk from "chalk";
import { logger } from "../logger";
import type { CfModule } from "./worker";
import type { Metafile } from "esbuild";

const ONE_KIB_BYTES = 1024;
// Current max is 3 MiB for free accounts, 10 MiB for paid accounts.
// See https://developers.cloudflare.com/workers/platform/limits/#worker-size
const MAX_GZIP_SIZE_BYTES = 3 * ONE_KIB_BYTES * ONE_KIB_BYTES;

async function getSize(modules: Pick<CfModule, "content">[]) {
	const gzipSize = gzipSync(
		await new Blob(modules.map((file) => file.content)).arrayBuffer()
	).byteLength;
	const aggregateSize = new Blob(modules.map((file) => file.content)).size;

	return { size: aggregateSize, gzipSize };
}

export async function printBundleSize(
	main: {
		name: string;
		content: string;
	},
	modules: CfModule[]
) {
	const { size, gzipSize } = await getSize([...modules, main]);

	const bundleReport = `${(size / ONE_KIB_BYTES).toFixed(2)} KiB / gzip: ${(
		gzipSize / ONE_KIB_BYTES
	).toFixed(2)} KiB`;

	const percentage = (gzipSize / MAX_GZIP_SIZE_BYTES) * 100;

	const colorizedReport =
		percentage > 90
			? chalk.red(bundleReport)
			: percentage > 70
				? chalk.yellow(bundleReport)
				: chalk.green(bundleReport);

	logger.log(`Total Upload: ${colorizedReport}`);
}

export function printOffendingDependencies(
	dependencies: Metafile["outputs"][string]["inputs"]
) {
	const warning: string[] = [];

	const dependenciesSorted = Object.entries(dependencies);
	dependenciesSorted.sort(
		([_adep, aData], [_bdep, bData]) =>
			bData.bytesInOutput - aData.bytesInOutput
	);
	const topLargest = dependenciesSorted.slice(0, 5);

	if (topLargest.length > 0) {
		warning.push(
			`Here are the ${topLargest.length} largest dependencies included in your script:`
		);

		for (const [dep, data] of topLargest) {
			warning.push(
				`- ${dep} - ${(data.bytesInOutput / ONE_KIB_BYTES).toFixed(2)} KiB`
			);
		}

		warning.push("If these are unnecessary, consider removing them");

		logger.warn(warning.join("\n"));
	}
}
