import open from "open";
import { logger } from "./logger";

/**
 * Wrapper around the `open` package that gracefully handles environments where
 * a browser opener (e.g. `xdg-open` on Linux) is unavailable. In those cases
 * the URL is printed so the user can copy-paste it manually, rather than
 * crashing with a confusing "file not found" error.
 *
 * @param url the URL to point the browser at
 */
export default async function openInBrowser(url: string): Promise<void> {
	try {
		const childProcess = await open(url);
		childProcess.on("error", (err) => {
			handleBrowserOpenError(url, err);
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			handleBrowserOpenError(url, err);
		} else {
			throw err;
		}
	}
}

function handleBrowserOpenError(url: string, err: unknown): void {
	const isEnoent = (err as NodeJS.ErrnoException).code === "ENOENT";
	const hint =
		process.platform === "linux" && isEnoent
			? " You may need to install `xdg-utils` (e.g. `apt install xdg-utils`) or set a default browser."
			: "";
	logger.warn(
		`Failed to open a browser automatically.${hint}\n` +
			`Please visit the following URL in your browser:\n${url}`
	);
	logger.debug(err instanceof Error ? (err.stack ?? String(err)) : String(err));
}
