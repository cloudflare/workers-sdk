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
 *      - If we couldn't parse the list, throw an `IgnoredBuildsError` with
 *        an empty list; the top-level handler renders a concise message +
 *        guidance.
 *      - Otherwise, prompt the user to approve those packages and retry.
 *      - If the prompt is cancelled (no TTY / closed stdin / Ctrl-C) or the
 *        user declines, throw an `IgnoredBuildsError` carrying the parsed
 *        list. The top-level handler renders concise guidance instead of
 *        the raw pnpm transcript.
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

/**
 * Sentinel error used to distinguish "stdin closed before the prompt was
 * answered" from a normal `CancelError` (which clack throws when the user
 * cancels an interactive prompt). Both map to `IgnoredBuildsError` for the
 * user, but keeping the sentinel internal keeps the intent clear.
 */
const STDIN_EOF_MARKER = "__c3_stdin_eof__";
const isStdinEOFError = (err: unknown): boolean =>
	err instanceof Error && err.message === STDIN_EOF_MARKER;

/**
 * Race the approve-builds confirm prompt against stdin's `end` event. In a
 * TTY the event never fires. In the e2e harness, the harness writes to stdin
 * before EOF and the prompt resolves first. In a fully non-interactive
 * shell (e.g. `pnpm create cloudflare < /dev/null`) stdin EOFs immediately,
 * the event loop would otherwise drain and the process would silently exit
 * with code 0; here we reject with a sentinel that the caller converts to
 * `IgnoredBuildsError`.
 */
const promptOrEOF = async (packages: string[]): Promise<boolean> => {
	const prompt = inputPrompt<boolean>({
		type: "confirm",
		question: `Run \`pnpm approve-builds ${packages.join(" ")}\` and retry the install?`,
		label: "approve-builds",
		defaultValue: true,
		throwOnError: true,
	});

	if (process.stdin.isTTY) {
		// A real terminal won't EOF on its own; no need for the race.
		return prompt;
	}

	let onEnd: (() => void) | undefined;
	const eof = new Promise<boolean>((_, reject) => {
		onEnd = () => reject(new Error(STDIN_EOF_MARKER));
		process.stdin.once("end", onEnd);
		// `resume()` keeps the event loop alive long enough for the `end`
		// event to fire even when nothing else is reading stdin.
		process.stdin.resume();
	});

	// Attach a silent error handler to the prompt so a late rejection from
	// clack (e.g. because stdin closed *after* the EOF race already won)
	// can't surface as an unhandled rejection. `Promise.race` below also
	// attaches handlers to both inputs, so in practice this is already
	// covered today, but this extra `.catch` makes the safety property
	// explicit and future-proofs against any change in Node's
	// unhandled-rejection policy.
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
		// pnpm flagged ignored builds but we couldn't parse the list — bail
		// out with a clean error rather than guess.
		throw new IgnoredBuildsError([], originalErr);
	}

	updateStatus(
		`${red("pnpm refused to run build scripts for:")} ${packages.join(", ")}`
	);

	// Drive recovery through the same prompt the e2e harness already knows how
	// to answer. In a real interactive shell the user types y/n. In the e2e
	// harness, a background responder writes Enter when it sees this question
	// (see `runC3` in e2e/helpers/run-c3.ts).
	//
	// In a fully non-interactive shell (no TTY, stdin already at EOF) clack
	// has no input to read; without intervention the event loop drains and
	// the process exits silently with code 0. To turn that into a clean,
	// actionable error we race the prompt against stdin's `end` event and
	// convert the EOF to an `IgnoredBuildsError` carrying the parsed list.
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
