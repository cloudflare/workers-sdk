import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import makeModuleCollector from "./module-collection";
import type { CfModule, CfScriptFormat } from "./api/worker";

type BundleResult = {
  modules: CfModule[];
  resolvedEntryPointPath: string;
  bundleType: "esm" | "commonjs";
  stop: (() => void) | undefined;
};

/**
 * Generate a bundle for the worker identified by the arguments passed in.
 */
export async function bundleWorker(
  entryFile: string,
  serveAssetsFromWorker: boolean,
  workingDir: string,
  destination: string,
  jsxFactory: string | undefined,
  jsxFragment: string | undefined,
  format: CfScriptFormat,
  watch?: esbuild.WatchMode
): Promise<BundleResult> {
  const moduleCollector = makeModuleCollector({ format });
  const result = await esbuild.build({
    ...getEntryPoint(entryFile, serveAssetsFromWorker),
    bundle: true,
    absWorkingDir: workingDir,
    outdir: destination,
    external: ["__STATIC_CONTENT_MANIFEST"],
    format: "esm",
    sourcemap: true,
    metafile: true,
    conditions: ["worker", "browser"],
    loader: {
      ".js": "jsx",
      ".html": "text",
      ".pem": "text",
      ".txt": "text",
    },
    plugins: [moduleCollector.plugin],
    ...(jsxFactory && { jsxFactory }),
    ...(jsxFragment && { jsxFragment }),
    watch,
  });

  const entryPointOutputs = Object.entries(result.metafile.outputs).filter(
    ([_path, output]) => output.entryPoint !== undefined
  );
  assert(
    entryPointOutputs.length > 0,
    `Cannot find entry-point "${entryFile}" in generated bundle.` +
      listEntryPoints(entryPointOutputs)
  );
  assert(
    entryPointOutputs.length < 2,
    "More than one entry-point found for generated bundle." +
      listEntryPoints(entryPointOutputs)
  );

  const entryPointExports = entryPointOutputs[0][1].exports;
  const bundleType = entryPointExports.length > 0 ? "esm" : "commonjs";

  return {
    modules: moduleCollector.modules,
    resolvedEntryPointPath: path.resolve(workingDir, entryPointOutputs[0][0]),
    bundleType,
    stop: result.stop,
  };
}

type EntryPoint =
  | { stdin: esbuild.StdinOptions; nodePaths: string[] }
  | { entryPoints: string[] };

/**
 * Create an object that describes the entry point for esbuild.
 *
 * If we are using the experimental asset handling, then the entry point is
 * actually a shim worker that will either return an asset from a KV store,
 * or delegate to the actual worker.
 */
function getEntryPoint(
  entryFile: string,
  serveAssetsFromWorker: boolean
): EntryPoint {
  if (serveAssetsFromWorker) {
    return {
      stdin: {
        contents: fs
          .readFileSync(
            path.join(__dirname, "../templates/static-asset-facade.js"),
            "utf8"
          )
          .replace("__ENTRY_POINT__", entryFile),
        sourcefile: "static-asset-facade.js",
        resolveDir: path.dirname(entryFile),
      },
      nodePaths: [path.join(__dirname, "../vendor")],
    };
  } else {
    return { entryPoints: [entryFile] };
  }
}

/**
 * Generate a string that describes the entry-points that were identified by esbuild.
 */
function listEntryPoints(
  outputs: [string, ValueOf<esbuild.Metafile["outputs"]>][]
): string {
  return outputs.map(([_input, output]) => output.entryPoint).join("\n");
}

type ValueOf<T> = T[keyof T];
