import open from "open";
/**
 * An extremely simple wrapper around the open command.
 * Specifically, it adds an 'error' event handler so that when this function
 * is called in environments where we can't open the browser (e.g. github codespaces,
 * stackblitz, remote servers), it doesn't just crash the process.
 */
export default async function openInBrowser(url: string): Promise<void> {
  const childProcess = await open(url);
  childProcess.on("error", () => {
    console.warn(`Failed to open ${url} in a browser`);
  });
}
