import { existsSync } from "node:fs";
import nodePath from "node:path";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { brandColor, dim, red } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { CancelError } from "@cloudflare/cli-shared-helpers/error";
import {
	inputPrompt,
	spinner,
} from "@cloudflare/cli-shared-helpers/interactive";
import * as cliPackages from "@cloudflare/cli-shared-helpers/packages";
import { fetch } from "undici";
import { detectPackageManager } from "./packageManagers";
import {
	extractIgnoredBuildPackages,
	IgnoredBuildsError,
	isPnpmIgnoredBuildsError,
} from "./pnpmBuildApprovals";
import type { C3Context } from "types";

type InstallConfig = {
	startText?: string;
	doneText?: string;
	dev?: boolean;
	force?: boolean;
	isWorkspaceRoot?: boolean;
};

/**
 * Install a list of packages to the local project directory.
 * Automatically detects the package manager from the environment.
 */
export const installPackages = async (
	packages: string[],
	config: InstallConfig = {}
) => {
	const { npm } = detectPackageManager();
	return cliPackages.installPackages(npm, packages, config);
};

/**
 * Installs the latest version of wrangler in the project directory.
 * Automatically detects the package manager from the environment.
 */
export async function installWrangler() {
	const { npm } = detectPackageManager();
	return cliPackages.installWrangler(npm, false);
}

/**
 * Install dependencies in the project directory via `npm install` or its equivalent.
 */
export const npmInstall = async (ctx: C3Context) => {
	// Skip this step if packages have already been installed
	const nodeModulesPath = nodePath.join(ctx.project.path, "node_modules");
	if (existsSync(nodeModulesPath)) {
		return;
	}

	const { npm } = detectPackageManager();

	if (npm === "pnpm") {
		await pnpmInstallWithBuildApprovalRetry(npm);
		return;
	}

	await runCommand([npm, "install"], {
		silent: true,
		startText: "Installing dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
};

/**
 * Run `pnpm install` under our own spinner so that on failure we don't dump
 * the captured pnpm transcript into the spinner's stop line.
 */
const runPnpmInstallQuiet = async (
	npm: string,
	startText: string
): Promise<void> => {
	const s = spinner();
	s.start(startText);
	try {
		await runCommand([npm, "install"], { silent: true, useSpinner: false });
		s.stop(`${brandColor("installed")} ${dim(`via \`${npm} install\``)}`);
	} catch (err) {
		s.stop(red("install failed"));
		throw err;
	}
};

const pnpmInstallWithBuildApprovalRetry = async (
	npm: string
): Promise<void> => {
	try {
		await runPnpmInstallQuiet(npm, "Installing dependencies");
		return;
	} catch (err) {
		if (!isPnpmIgnoredBuildsError(err)) {
			throw err;
		}
		await recoverFromIgnoredBuilds(npm, err);
	}
};

// Sentinel for "stdin closed before the prompt was answered", to
// distinguish from a normal `CancelError`. Both map to `IgnoredBuildsError`.
const STDIN_EOF_MARKER = "__c3_stdin_eof__";
const isStdinEOFError = (err: unknown): boolean =>
	err instanceof Error && err.message === STDIN_EOF_MARKER;

/**
 * Race the approve-builds confirm prompt against stdin's `end` event. In a
 * TTY the event never fires; in the e2e harness the prompt resolves first;
 * in a fully non-interactive shell (no TTY, stdin at EOF) we reject with a
 * sentinel so the caller can convert it to `IgnoredBuildsError` instead of
 * letting the process exit silently with code 0.
 */
const promptOrEOF = async (packages: string[]): Promise<boolean> => {
	const prompt = inputPrompt<boolean>({
		type: "confirm",
		question: `Run \`pnpm approve-builds ${packages.join(" ")}\` and retry the install?`,
		label: "approve-builds",
		defaultValue: true,
		throwOnError: true,
	});

	// A real terminal won't EOF on its own; no need for the race.
	if (process.stdin.isTTY) {
		return prompt;
	}

	let onEnd: (() => void) | undefined;
	const eof = new Promise<boolean>((_, reject) => {
		onEnd = () => reject(new Error(STDIN_EOF_MARKER));
		process.stdin.once("end", onEnd);
		// Keep the event loop alive so the `end` event can fire.
		process.stdin.resume();
	});

	// Swallow late prompt rejections (e.g. after EOF wins the race) so they
	// don't surface as unhandled rejections.
	prompt.catch(() => {});

	try {
		return await Promise.race([prompt, eof]);
	} finally {
		if (onEnd) {
			process.stdin.removeListener("end", onEnd);
		}
	}
};

const recoverFromIgnoredBuilds = async (
	npm: string,
	originalErr: Error
): Promise<void> => {
	const packages = extractIgnoredBuildPackages(originalErr);

	if (packages.length === 0) {
		// Flagged ignored builds but couldn't parse the list — bail out
		// rather than guess.
		throw new IgnoredBuildsError([], originalErr);
	}

	updateStatus(
		`${red("pnpm refused to run build scripts for:")} ${packages.join(", ")}`
	);

	let approve: boolean;
	try {
		approve = await promptOrEOF(packages);
	} catch (promptErr) {
		if (promptErr instanceof CancelError || isStdinEOFError(promptErr)) {
			throw new IgnoredBuildsError(packages, originalErr);
		}
		throw promptErr;
	}

	if (!approve) {
		throw new IgnoredBuildsError(packages, originalErr);
	}

	// Non-interactive when packages are listed explicitly.
	await runCommand([npm, "approve-builds", ...packages], {
		silent: true,
		startText: "Approving dependency build scripts",
		doneText: `${brandColor("approved")} ${dim(packages.join(", "))}`,
	});

	try {
		await runPnpmInstallQuiet(npm, "Re-running install");
	} catch (retryErr) {
		if (isPnpmIgnoredBuildsError(retryErr)) {
			throw new IgnoredBuildsError(
				extractIgnoredBuildPackages(retryErr),
				retryErr
			);
		}
		throw retryErr;
	}
};

type NpmInfoResponse = {
	"dist-tags": { latest: string };
};

/**
 * Get the latest version of an npm package by making a request to the npm REST API.
 */
export async function getLatestPackageVersion(packageSpecifier: string) {
	const resp = await fetch(`https://registry.npmjs.org/${packageSpecifier}`);
	const npmInfo = (await resp.json()) as NpmInfoResponse;
	return npmInfo["dist-tags"].latest;
}
