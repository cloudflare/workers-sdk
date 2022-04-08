import { Writable as WritableStream } from "node:stream";
import { execaCommand } from "execa";
import { PATH_TO_WRANGLER } from "./constants";
import { pipe, cleanMessage } from "./pipe";
import type { ExecaError } from "execa";

export async function runWrangler1(command?: string) {
  const stdout = new WritableStream({
    write: pipe(console.log),
  });
  const stderr = new WritableStream({
    write: pipe((message) => {
      message.startsWith("Warning:")
        ? console.warn(message)
        : console.error(message);
    }),
  });

  const process = execaCommand(`${PATH_TO_WRANGLER} ${command}`);

  process.stdout?.pipe(stdout);
  process.stderr?.pipe(stderr);

  try {
    return await process;
  } catch (e) {
    const error = e as ExecaError<string>;
    error.message = cleanMessage(error.message);
    throw error;
  }
}
