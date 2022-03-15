import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import createModuleCollector from "./module-collection";
import type { Config } from "./config";
import type { Entry } from "./entry";
import type { CfModule } from "./worker";

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
  entry: Entry,
  destination: string,
  options: {
    serveAssetsFromWorker: boolean;
    jsxFactory: string | undefined;
    jsxFragment: string | undefined;
    rules: Config["rules"];
    watch?: esbuild.WatchMode;
  }
): Promise<BundleResult> {
  const { serveAssetsFromWorker, jsxFactory, jsxFragment, rules, watch } =
    options;
  const entryDirectory = path.dirname(entry.file);
  const moduleCollector = createModuleCollector({
    wrangler1xlegacyModuleReferences: {
      rootDirectory: entryDirectory,
      fileNames: new Set(
        fs
          .readdirSync(entryDirectory, { withFileTypes: true })
          .filter(
            (dirEntry) =>
              dirEntry.isFile() && dirEntry.name !== path.basename(entry.file)
          )
          .map((dirEnt) => dirEnt.name)
      ),
    },
    format: entry.format,
    rules,
  });
  const result = await esbuild.build({
    ...getEntryPoint(entry.file, serveAssetsFromWorker),
    bundle: true,
    absWorkingDir: entry.directory,
    outdir: destination,
    external: ["__STATIC_CONTENT_MANIFEST"],
    format: "esm",
    sourcemap: true,
    metafile: true,
    conditions: ["worker", "browser"],
    loader: {
      ".js": "jsx",
      ".mjs": "jsx",
      ".cjs": "jsx",
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
    `Cannot find entry-point "${entry.file}" in generated bundle.` +
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
    resolvedEntryPointPath: path.resolve(
      entry.directory,
      entryPointOutputs[0][0]
    ),
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
