import { updateStatus, warn } from "@cloudflare/cli-shared-helpers";
import { blue } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import {
	spinner,
	spinnerFrames,
} from "@cloudflare/cli-shared-helpers/interactive";
import Haikunator from "haikunator";
import { detectPackageManager } from "helpers/packageManagers";
import { getLatestPackageVersion } from "helpers/packages";
import open from "open";
import semver from "semver";
import { version } from "../../package.json";
import type { C3Args } from "types";

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

// Spawn a separate process running the most recent version of c3
export const runLatest = async () => {
	const { npm } = detectPackageManager();
	const args = process.argv.slice(2);

	// the parsing logic of `npm create` requires `--` to be supplied
	// before any flags intended for the target command.
	if (npm === "npm") {
		args.unshift("--");
	}

	await runCommand([npm, "create", "cloudflare@latest", ...args], {
		// Mark the spawned process so it doesn't attempt to update and re-spawn
		// again, which would loop indefinitely when the package manager keeps
		// resolving the same version of `cloudflare@latest`.
		env: { CREATE_CLOUDFLARE_RELAUNCHED: "true" },
	});
};

export const C3_DEFAULTS: C3Args = {
	projectName: new Haikunator().haikunate({ tokenHex: true }),
	category: "hello-world",
	type: "hello-world-with-assets",
	framework: "analog",
	experimental: false,
	autoUpdate: true,
	deploy: false,
	git: true,
	agents: true,
	open: true,
	lang: "ts",
	template:
		"cloudflare/workers-sdk/packages/create-cloudflare/templates/hello-world-with-assets",
};

export const WRANGLER_DEFAULTS = {
	...C3_DEFAULTS,
	type: "hello-world-with-assets",
	deploy: false,
};
