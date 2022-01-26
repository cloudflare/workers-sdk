import assert from "node:assert";
import { build } from "esbuild";
import type { CfScriptFormat } from "./api/worker";
import type { Metafile } from "esbuild";

/**
 * A function to "guess" the type of worker.
 * We do this by running a lightweight build of the actual script,
 * and looking at the metafile generated by esbuild. If it has a default
 * export (or really, any exports), that means it's a "modules" worker.
 * Else, it's a "service-worker" worker. This seems hacky, but works remarkably
 * well in practice.
 */
export default async function guessWorkerFormat(
  filePath: string,
  hint: CfScriptFormat | undefined
): Promise<CfScriptFormat> {
  if (filePath.endsWith(".wasm")) {
    return "modules";
  }

  const result = await build({
    entryPoints: [filePath],
    metafile: true,
    bundle: false,
    format: "esm",
    write: false,
  });
  // result.metafile is defined because of the `metafile: true` option above.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const metafile = result.metafile!;
  const entryPoints = Object.entries(metafile.outputs).filter(
    ([_path, output]) => output.entryPoint !== undefined
  );
  assert(
    entryPoints.length > 0,
    `Cannot find entry-point "${filePath}" in generated bundle.` +
      listEntryPoints(entryPoints)
  );
  assert(
    entryPoints.length < 2,
    "More than one entry-point found for generated bundle." +
      listEntryPoints(entryPoints)
  );
  const guessedWorkerFormat =
    entryPoints[0][1].exports.length > 0 ? "modules" : "service-worker";

  if (hint) {
    if (hint !== guessedWorkerFormat) {
      if (hint === "service-worker") {
        throw new Error(
          "You configured this worker to be a 'service-worker', but the file you are trying to build appears to have es module exports. Please pass `--format modules`, or simply remove the configuration."
        );
      } else {
        throw new Error(
          "You configured this worker to be 'modules', but the file you are trying to build doesn't export a handler. Please pass `--format service-worker`, or simply remove the configuration."
        );
      }
    }
  }
  return guessedWorkerFormat;
}

function listEntryPoints(
  outputs: [string, ValueOf<Metafile["outputs"]>][]
): string {
  return outputs.map(([_input, output]) => output.entryPoint).join("\n");
}

type ValueOf<T> = T[keyof T];
