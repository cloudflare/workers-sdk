import { updateStatus, warn } from "@cloudflare/cli";
import Haikunator from "haikunator";
import open from "open";

/**
 * An extremely simple wrapper around the open command.
 * Specifically, it adds an 'error' event handler so that when this function
 * is called in environments where we can't open the browser (e.g. GitHub Codespaces,
 * StackBlitz, remote servers), it doesn't just crash the process.
 *
 * @param url the URL to point the browser at
 */
export async function openInBrowser(url: string): Promise<void> {
	updateStatus("Opening browser");
	const childProcess = await open(url);
	childProcess.on("error", () => {
		warn("Failed to open browser");
	});
}

export const C3_DEFAULTS = {
	projectName: new Haikunator().haikunate({ tokenHex: true }),
	type: "hello-world",
	framework: "angular",
	autoUpdate: true,
	deploy: true,
	git: true,
	open: true,
	ts: true,
};

export const WRANGLER_DEFAULTS = {
	...C3_DEFAULTS,
	type: "hello-world",
	deploy: false,
};
