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
  args: { script?: string; format?: CfScriptFormat | undefined },
  config: Config,
  command: "dev" | "publish"
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

  await runCustomBuild(file, config.build);

  if (fileExists(file) === false) {
    throw new Error(
      `Could not resolve "${path.relative(process.cwd(), file)}".`
    );
  }
  const format = await guessWorkerFormat(
    file,
    directory,
    args.format ?? config.build?.upload?.format,
    config.tsconfig
  );

  const { localBindings, remoteBindings } =
    partitionDurableObjectBindings(config);

  if (command === "dev" && remoteBindings.length > 0) {
    console.warn(
      "WARNING: You have Durable Object bindings, which are not defined locally in the worker being developed.\n" +
        "Be aware that changes to the data stored in these Durable Objects will be permanent and affect the live instances.\n" +
        "Remote Durable Objects that are affected:\n" +
        remoteBindings.map((b) => `- ${JSON.stringify(b)}`).join("\n")
    );
  }

  if (format === "service-worker" && localBindings.length > 0) {
    const errorMessage =
      "You seem to be trying to use Durable Objects in a Worker written as a service-worker.";
    const addScriptName =
      "You can use Durable Objects defined in other Workers by specifying a `script_name` in your wrangler.toml, where `script_name` is the name of the Worker that implements that Durable Object. For example:";
    const addScriptNameExamples = generateAddScriptNameExamples(localBindings);
    const migrateText =
      "Alternatively, migrate your worker to ES Module syntax to implement a Durable Object in this Worker:";
    const migrateUrl =
      "https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/";
    throw new Error(
      `${errorMessage}\n${addScriptName}\n${addScriptNameExamples}\n${migrateText}\n${migrateUrl}`
    );
  }

  return { file, directory, format };
}

export async function runCustomBuild(
  expectedEntry: string,
  build: Config["build"]
) {
  if (build?.command) {
    // TODO: add a deprecation message here?
    console.log("running:", build.command);
    await execaCommand(build.command, {
      shell: true,
      // we keep these two as "inherit" so that
      // logs are still visible.
      stdout: "inherit",
      stderr: "inherit",
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
  hint: CfScriptFormat | undefined,
  tsconfig?: string | undefined
): Promise<CfScriptFormat> {
  const result = await esbuild.build({
    entryPoints: [entryFile],
    absWorkingDir: entryWorkingDirectory,
    metafile: true,
    bundle: false,
    format: "esm",
    target: "es2020",
    write: false,
    loader: {
      ".js": "jsx",
      ".mjs": "jsx",
      ".cjs": "jsx",
    },
    ...(tsconfig && { tsconfig }),
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

  let guessedWorkerFormat: CfScriptFormat;
  const scriptExports = entryPoints[0][1].exports;
  if (scriptExports.length > 0) {
    if (scriptExports.includes("default")) {
      guessedWorkerFormat = "modules";
    } else {
      console.warn(
        `The entrypoint ${path.relative(
          process.cwd(),
          entryFile
        )} has exports like an ES Module, but hasn't defined a default export like a module worker normally would. Building the worker using "service-worker" format...`
      );
      guessedWorkerFormat = "service-worker";
    }
  } else {
    guessedWorkerFormat = "service-worker";
  }

  if (hint) {
    if (hint !== guessedWorkerFormat) {
      if (hint === "service-worker") {
        throw new Error(
          "You configured this worker to be a 'service-worker', but the file you are trying to build appears to have a `default` export like a module worker. Please pass `--format modules`, or simply remove the configuration."
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

type DurableObjectBindings = Config["durable_objects"]["bindings"];

/**
 * Groups the durable object bindings into two lists:
 * those that are defined locally and those that refer to a durable object defined in another script.
 */
function partitionDurableObjectBindings(config: Config): {
  localBindings: DurableObjectBindings;
  remoteBindings: DurableObjectBindings;
} {
  const localBindings: DurableObjectBindings = [];
  const remoteBindings: DurableObjectBindings = [];
  for (const binding of config.durable_objects.bindings) {
    if (binding.script_name === undefined) {
      localBindings.push(binding);
    } else {
      remoteBindings.push(binding);
    }
  }
  return { localBindings, remoteBindings };
}

/**
 * Generates some help text based on the Durable Object bindings in a given
 * config indicating how the user can add a `script_name` field to bind an
 * externally defined Durable Object.
 */
function generateAddScriptNameExamples(
  localBindings: DurableObjectBindings
): string {
  function exampleScriptName(binding_name: string): string {
    return `${binding_name.toLowerCase().replaceAll("_", "-")}-worker`;
  }

  return localBindings
    .map(({ name, class_name }) => {
      const script_name = exampleScriptName(name);
      const currentBinding = `{ name = ${name}, class_name = ${class_name} }`;
      const fixedBinding = `{ name = ${name}, class_name = ${class_name}, script_name = ${script_name} }`;

      return `${currentBinding} ==> ${fixedBinding}`;
    })
    .join("\n");
}
