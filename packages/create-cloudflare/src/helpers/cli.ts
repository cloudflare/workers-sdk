import { updateStatus, warn } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { spinner, spinnerFrames } from "@cloudflare/cli/interactive";
import Haikunator from "haikunator";
import { getLatestPackageVersion } from "helpers/packages";
import open from "open";
import semver from "semver";
import { version } from "../../package.json";

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

// Detects if a newer version of c3 is available by comparing the version
// specified in package.json with the `latest` tag from npm
export const isUpdateAvailable = async () => {
	// Use a spinner when running this check since it may take some time
	const s = spinner(spinnerFrames.vertical, blue);
	s.start("Checking if a newer version is available");
	try {
		const latestVersion = await getLatestPackageVersion("create-cloudflare");
		return (
			// Don't auto-update to major versions
			semver.diff(latestVersion, version) !== "major" &&
			semver.gt(latestVersion, version)
		);
	} catch {
		s.update("Failed to read latest version from npm.");
		return false;
	} finally {
		s.stop();
	}
};

export const C3_DEFAULTS = {
	projectName: new Haikunator().haikunate({ tokenHex: true }),
	type: "hello-world",
	framework: "analog",
	autoUpdate: true,
	deploy: true,
	git: true,
	open: true,
	ts: true,
	template:
		"cloudflare/workers-sdk/packages/create-cloudflare/templates/hello-world",
};

export const WRANGLER_DEFAULTS = {
	...C3_DEFAULTS,
	type: "hello-world",
	deploy: false,
};
