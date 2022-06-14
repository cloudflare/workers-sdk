import { Blob } from "node:buffer";
import { gzipSync } from "node:zlib";
import { logger } from "./logger";
import type { CfModule } from "./worker";

const getSize = (modules: CfModule[]) => {
  const gzipSize = modules
    .map((file) => gzipSync(file.content).byteLength)
    .reduce((acc, bytes) => acc + bytes, 0);
  const aggregateSize = new Blob(modules.map((file) => file.content)).size;

  return { size: aggregateSize, gzipSize };
};

function getCompressedSize(modules: CfModule[]): string {
  const { size, gzipSize } = getSize(modules);
  return `${(Math.ceil(size) / 1024).toFixed(2)} KiB / gzip: ${(
    Math.ceil(gzipSize) / 1024
  ).toFixed(2)} KiB`;
}

export function printBundleSize(modules: CfModule[]) {
  logger.log(`Total Upload: ${getCompressedSize(modules)}`);
}
