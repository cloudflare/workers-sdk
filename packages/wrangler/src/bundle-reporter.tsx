import { Blob } from "node:buffer";
import { gzipSync } from "node:zlib";
import { logger } from "./logger";
import type { CfModule } from "./worker";

async function getSize(modules: CfModule[]) {
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

	const bundleReport = `${(size / 1024).toFixed(2)} KiB / gzip: ${(
		gzipSize / 1024
	).toFixed(2)} KiB`;

	logger.log(`Total Upload: ${bundleReport}`);
}
