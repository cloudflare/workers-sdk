import open from "open";
import { logger } from "./logger";

/**
 * An extremely simple wrapper around the open command.
 * Specifically, it adds an 'error' event handler so that when this function
 * is called in environments where we can't open the browser (e.g. GitHub Codespaces,
 * StackBlitz, remote servers), it doesn't just crash the process.
 *
 * @param url the URL to point the browser at
 */
export default async function openInBrowser(url: string): Promise<void> {
  const errorMessage = `Failed to open ${url} in a browser`;

  try {
    const childProcess = await open(url);
    childProcess.on("error", () => {
      logger.warn(errorMessage);
    });
  } catch (e) {
    const cause = e instanceof Error ? e : new Error(`${e}`);
    throw new Error(errorMessage, { cause });
  }
}
