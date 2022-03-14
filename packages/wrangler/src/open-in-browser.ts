import open from "open";

/**
 * An extremely simple wrapper around the open command.
 * Specifically, it adds an 'error' event handler so that when this function
 * is called in environments where we can't open the browser (e.g. github codespaces,
 * stackblitz, remote servers), it doesn't just crash the process.
 *
 * @param url the URL to point the browser at
 * @param options open a chromium-based browser instead of the default
 */
export default async function openInBrowser(
  url: string,
  { forceChromium }: { forceChromium: boolean } = { forceChromium: false }
): Promise<void> {
  const options: open.Options | undefined = forceChromium
    ? {
        app: [{ name: open.apps.chrome }, { name: open.apps.edge }],
      }
    : undefined;
  const childProcess = await open(url, options);
  childProcess.on("error", () => {
    console.warn(`Failed to open ${url} in a browser`);
  });
}
