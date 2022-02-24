import { existsSync } from "node:fs";
import path from "node:path";
import type { Config } from "./config";

/**
 * An entry point for the Worker.
 *
 * It consists not just of a `file`, but also of a `directory` that is used to resolve relative paths.
 */
export type Entry = { file: string; directory: string };

/**
 * Compute the entry-point for the Worker.
 */
export function getEntry(
  config: Config,
  command: string,
  script?: string
): Entry {
  let file: string;
  let directory = process.cwd();
  if (script) {
    // If the script name comes from the command line it is relative to the current working directory.
    file = path.resolve(script);
  } else if (config.main === undefined) {
    throw new Error(
      `Missing entry-point: The entry-point should be specified via the command line (e.g. \`wrangler ${command} path/to/script\`) or the \`main\` config field.`
    );
  } else {
    directory = path.resolve(path.dirname(config.configPath ?? "."));
    file = path.resolve(directory, config.main);
  }

  if (!config.build?.command && fileExists(file) === false) {
    throw new Error(
      `Could not resolve "${path.relative(process.cwd(), file)}".`
    );
  }
  return { file, directory };
}

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
