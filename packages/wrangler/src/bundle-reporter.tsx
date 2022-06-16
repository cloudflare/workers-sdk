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

  /**
   * Math.ceil is being used to handle an issue of .01 KiB variations seemingly randomly causing flakey tests.
   * ceil forcing next integer up will prevent optimistic compression uploads being slightly higher than the given user limit.
   */
  return `${Math.ceil(size / 1024).toFixed(2)} KiB / gzip: ${Math.ceil(
    gzipSize / 1024
  ).toFixed(2)} KiB`;
}

export function printBundleSize(modules: CfModule[], content: string) {
  logger.log(
    `Total Upload: ${getCompressedSize([
      ...modules,
      { name: "workerScript", content },
    ])}`
  );
}
