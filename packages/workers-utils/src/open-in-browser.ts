import open from "open";
import type { Logger } from "./logger";

/**
 * Wrapper around the `open` package that gracefully handles environments where
 * a browser opener (e.g. `xdg-open` on Linux) is unavailable. In those cases
 * the URL is printed so the user can copy-paste it manually, rather than
 * crashing with a confusing "file not found" error.
 *
 * The consumer's `logger` is passed in rather than imported: this package is
 * shared across CLIs and has no logger singleton of its own.
 *
 * @param url the URL to point the browser at
 * @param logger the consumer's logger, used to surface the manual-open fallback
 */
export async function openInBrowser(
	url: string,
	logger: Logger
): Promise<void> {
	try {
		const childProcess = await open(url);
		childProcess.on("error", (err) => {
			handleBrowserOpenError(url, err, logger);
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			handleBrowserOpenError(url, err, logger);
		} else {
			throw err;
		}
	}
}

function handleBrowserOpenError(
	url: string,
	err: unknown,
	logger: Logger
): void {
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
