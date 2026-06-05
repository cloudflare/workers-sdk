import { existsSync } from "node:fs";
import nodePath from "node:path";
import { updateStatus } from "@cloudflare/cli-shared-helpers";
import { brandColor, dim, red } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import {
	inputPrompt,
	isInteractive,
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
 *
 * For pnpm, we handle `ERR_PNPM_IGNORED_BUILDS` specially: instead of dumping
 * the full pnpm transcript to the user, we parse the flagged packages and (in
 * an interactive shell) offer to run `pnpm approve-builds <pkg>...` and retry
 * the install once. See `pnpmInstallWithBuildApprovalRetry`.
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
 * Run `pnpm install` quietly under our own spinner. We use `useSpinner: false`
 * to disable `runCommand`'s built-in spinner so that, on failure, we don't
 * dump the entire captured pnpm transcript into the spinner's stop line.
 * The caller is responsible for interpreting any thrown error.
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
		// Show a one-line failure; the caller decides whether to print more.
		s.stop(red("install failed"));
		throw err;
	}
};

/**
 * Drives a pnpm install with a single-shot recovery path for
 * `ERR_PNPM_IGNORED_BUILDS`:
 *
 *   1. Try `pnpm install`.
 *   2. If the install fails for any reason _other than_ ignored build
 *      scripts, rethrow.
 *   3. If pnpm refused to run dependency build scripts, parse the flagged
 *      package list.
 *      - If we couldn't parse the list, or we're not running interactively
 *        (CI), throw an `IgnoredBuildsError` carrying whatever we did parse;
 *        the top-level handler renders a concise message + guidance.
 *      - Otherwise, prompt the user to approve those packages and retry.
 *   4. If they confirm, run `pnpm approve-builds <pkgs>` (deterministic and
 *      non-interactive when packages are passed explicitly) and re-run the
 *      install once. A second failure becomes an `IgnoredBuildsError`.
 */
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

const recoverFromIgnoredBuilds = async (
	npm: string,
	originalErr: Error
): Promise<void> => {
	const packages = extractIgnoredBuildPackages(originalErr);

	if (packages.length === 0) {
		// pnpm flagged ignored builds but we couldn't parse the list — bail
		// out with a clean error rather than guess.
		throw new IgnoredBuildsError([], originalErr);
	}

	updateStatus(
		`${red("pnpm refused to run build scripts for:")} ${packages.join(", ")}`
	);

	if (!isInteractive()) {
		// CI / non-TTY: don't auto-approve framework-introduced build scripts.
		throw new IgnoredBuildsError(packages, originalErr);
	}

	const approve = await inputPrompt<boolean>({
		type: "confirm",
		question: `Run \`pnpm approve-builds ${packages.join(" ")}\` and retry the install?`,
		label: "approve-builds",
		defaultValue: true,
		throwOnError: true,
	});

	if (!approve) {
		throw new IgnoredBuildsError(packages, originalErr);
	}

	// `pnpm approve-builds <pkg>...` is non-interactive when packages are
	// listed explicitly; it writes them to `pnpm-workspace.yaml#allowBuilds`
	// (matching the format `writePnpmBuildApprovals` already uses) and runs
	// their build scripts in place.
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
