import assert from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { execaCommand } from "execa";
import type { Config } from "./config";
import type { CfScriptFormat } from "./worker";
import type { Metafile } from "esbuild";

/**
 * An entry point for the Worker.
 *
 * It consists not just of a `file`, but also of a `directory` that is used to resolve relative paths.
 */
export type Entry = { file: string; directory: string; format: CfScriptFormat };

/**
 * Compute the entry-point for the Worker.
 */
export async function getEntry(
  args: {
    script?: string;
    format?: CfScriptFormat | undefined;
    env: string | undefined;
  },
  config: Config,
  command: string
): Promise<Entry> {
  let file: string;
  let directory = process.cwd();
  if (args.script) {
    // If the script name comes from the command line it is relative to the current working directory.
    file = path.resolve(args.script);
  } else if (config.main === undefined) {
    throw new Error(
      `Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler ${command} path/to/script\`) or the \`main\` config field.`
    );
  } else {
    directory = path.resolve(path.dirname(config.configPath ?? "."));
    file = path.resolve(directory, config.main);
  }

  await runCustomBuild(file, config.build, args.env);

  if (fileExists(file) === false) {
    throw new Error(
      `Could not resolve "${path.relative(process.cwd(), file)}".`
    );
  }
  const format = await guessWorkerFormat(
    file,
    directory,
    args.format ?? config.build?.upload?.format
  );
  return { file, directory, format };
}

export async function runCustomBuild(
  expectedEntry: string,
  build: Config["build"],
  env: string | undefined
) {
  if (build?.command) {
    // TODO: add a deprecation message here?
    console.log("running:", build.command);
    await execaCommand(build.command, {
      shell: true,
      stdout: "inherit",
      stderr: "inherit",
      timeout: 1000 * 30,
      env: {
        CLOUDFLARE_WRANGLER_ENV: env,
      },
      ...(build.cwd && { cwd: build.cwd }),
    });

    if (fileExists(expectedEntry) === false) {
      throw new Error(
        `Could not resolve "${path.relative(
          process.cwd(),
          expectedEntry
        )}" after running custom build: ${build.command}`
      );
    }
  }
}

/**
 * A function to "guess" the type of worker.
 * We do this by running a lightweight build of the actual script,
 * and looking at the metafile generated by esbuild. If it has a default
 * export (or really, any exports), that means it's a "modules" worker.
 * Else, it's a "service-worker" worker. This seems hacky, but works remarkably
 * well in practice.
 */
export default async function guessWorkerFormat(
  entryFile: string,
  entryWorkingDirectory: string,
  hint: CfScriptFormat | undefined
): Promise<CfScriptFormat> {
  const result = await esbuild.build({
    entryPoints: [entryFile],
    absWorkingDir: entryWorkingDirectory,
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
    `Cannot find entry-point "${entryFile}" in generated bundle.` +
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
          "You configured this worker to be a 'service-worker', but the file you are trying to build appears to have ES module exports. Please pass `--format modules`, or simply remove the configuration."
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

/**
 * Returns true if the given `filePath` exists as-is,
 * or if some version of it (by appending a common extension) exists.
 */
export function fileExists(filePath: string): boolean {
  if (path.extname(filePath) !== "") {
    return existsSync(filePath);
  }
  const base = path.join(path.dirname(filePath), path.basename(filePath));
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    if (existsSync(base + ext)) {
      return true;
    }
  }
  return false;
}
