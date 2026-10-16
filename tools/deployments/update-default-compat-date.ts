/**
 * Keeps the default compatibility date in sync with the pinned `workerd`.
 *
 * `DEFAULT_COMPAT_DATE` in `@cloudflare/workers-utils` is the compatibility date
 * that Wrangler, C3, the Vite plugin and friends fall back to when the user has
 * not specified one. It is committed rather than computed at runtime so that it
 * is fixed for a given release, and it is derived from the `workerd` version
 * pinned in the pnpm catalog rather than from the current date, because workerd
 * rejects a compatibility date later than either of:
 *
 * - its `MAXIMUM_COMPATIBILITY_DATE`, which is its release date plus 7 days, or
 * - today's date (UTC).
 *
 * Defaulting to the current date breaks the first rule whenever a `workerd`
 * release is delayed by more than a week, which is exactly the failure this
 * derivation avoids. Note that the 7 day allowance must not be added here: that
 * would break the second rule for anyone installing within a week of the
 * `workerd` release.
 *
 * Because the value is a pure function of the repository, `check` mode can
 * enforce it on every PR. It is refreshed automatically on Dependabot's
 * `workerd` bumps (see `tools/dependabot/generate-dependabot-pr-changesets.ts`).
 *
 * Usage:
 *   node -r esbuild-register tools/deployments/update-default-compat-date.ts
 *   node -r esbuild-register tools/deployments/update-default-compat-date.ts check
 *
 * @see https://github.com/cloudflare/workerd/blob/main/src/workerd/io/BUILD.bazel
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadCatalog } from "./validate-catalog-usage";

const ROOT = resolve(__dirname, "../..");

export const DEFAULT_COMPAT_DATE_PATH =
	"packages/workers-utils/src/default-compat-date.ts";

/**
 * Matches the `DEFAULT_COMPAT_DATE` declaration, capturing the date so it can be
 * read and replaced without disturbing the surrounding documentation.
 */
const DECLARATION_RE =
	/(export const DEFAULT_COMPAT_DATE: CompatDate = ")(\d{4}-\d{2}-\d{2})(")/;

/**
 * `workerd` versions are `1.<release date>.<patch>`, e.g. `1.20260811.1` was
 * released on 2026-08-11, which is also the date its main module reports as
 * `compatibilityDate`.
 */
const WORKERD_VERSION_RE = /^1\.(\d{4})(\d{2})(\d{2})\.\d+$/;

/**
 * Derives a `workerd` release's compatibility date from its version.
 */
export function getCompatDateForWorkerdVersion(version: string): string {
	const match = WORKERD_VERSION_RE.exec(version);
	if (match === null) {
		throw new Error(
			`Could not derive a compatibility date from the workerd version "${version}". ` +
				`Expected "1.<YYYYMMDD>.<patch>". If workerd's versioning scheme has ` +
				`changed, update ${__filename}.`
		);
	}
	const [, year, month, day] = match;
	return `${year}-${month}-${day}`;
}

/**
 * Reads the pinned `workerd` version's compatibility date, checking that the
 * installed `workerd` matches the pin so that the derived date reflects the
 * runtime that will actually ship.
 */
export function getPinnedWorkerdCompatDate(): string {
	const version = loadCatalog().get("workerd");
	if (version === undefined) {
		throw new Error(
			"Could not find a `workerd` entry in the catalog in pnpm-workspace.yaml."
		);
	}

	const installedVersion = getInstalledWorkerdVersion();
	if (installedVersion !== version) {
		throw new Error(
			`The installed workerd is "${installedVersion}" but the catalog in ` +
				`pnpm-workspace.yaml pins "${version}". Run \`pnpm install\` so that the ` +
				`default compatibility date is derived from the workerd that will ` +
				`actually ship.`
		);
	}

	return getCompatDateForWorkerdVersion(version);
}

/**
 * The version of the installed `workerd`, read from its `package.json` so that
 * nothing here depends on workerd's internal structure.
 *
 * `workerd` is a non-optional dependency of miniflare and this script cannot run
 * before `pnpm install` (it is loaded through `esbuild-register`), so there is no
 * legitimate state in which it is missing. Throws rather than reporting absence.
 */
export function getInstalledWorkerdVersion(): string {
	const requireFromMiniflare = createRequire(
		resolve(ROOT, "packages/miniflare/package.json")
	);

	let manifestPath: string;
	try {
		manifestPath = requireFromMiniflare.resolve("workerd/package.json");
	} catch (error) {
		throw new Error(
			`Could not resolve the installed workerd from packages/miniflare. Run ` +
				`\`pnpm install\` and try again.`,
			{ cause: error }
		);
	}

	const { version } = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
		version?: unknown;
	};

	if (typeof version !== "string") {
		throw new Error(
			`The installed workerd's package.json at ${manifestPath} has no \`version\`.`
		);
	}

	return version;
}

export function readDefaultCompatDate(source: string): string {
	const match = DECLARATION_RE.exec(source);
	if (match === null) {
		throw new Error(
			`Could not find the DEFAULT_COMPAT_DATE declaration in ${DEFAULT_COMPAT_DATE_PATH}.`
		);
	}
	return match[2];
}

export function setDefaultCompatDate(source: string, compatDate: string) {
	if (!DECLARATION_RE.test(source)) {
		throw new Error(
			`Could not find the DEFAULT_COMPAT_DATE declaration in ${DEFAULT_COMPAT_DATE_PATH}.`
		);
	}
	return source.replace(DECLARATION_RE, `$1${compatDate}$3`);
}

/**
 * Rewrites `DEFAULT_COMPAT_DATE` to the pinned `workerd`'s compatibility date.
 *
 * @returns The date it was changed to, or undefined if it was already correct
 */
export function updateDefaultCompatDate(): string | undefined {
	const filePath = resolve(ROOT, DEFAULT_COMPAT_DATE_PATH);
	const source = readFileSync(filePath, "utf-8");
	const current = readDefaultCompatDate(source);
	const expected = getPinnedWorkerdCompatDate();

	if (current === expected) {
		console.log(`DEFAULT_COMPAT_DATE is up to date (${current}).`);
		return undefined;
	}

	writeFileSync(filePath, setDefaultCompatDate(source, expected));
	console.log(`Updated DEFAULT_COMPAT_DATE from ${current} to ${expected}.`);
	return expected;
}

/**
 * Asserts that `DEFAULT_COMPAT_DATE` matches the pinned `workerd`'s
 * compatibility date.
 *
 * @returns A process exit code
 */
export function checkDefaultCompatDate(): number {
	const source = readFileSync(resolve(ROOT, DEFAULT_COMPAT_DATE_PATH), "utf-8");
	const current = readDefaultCompatDate(source);
	const expected = getPinnedWorkerdCompatDate();

	if (current !== expected) {
		console.error(
			`::error::DEFAULT_COMPAT_DATE is "${current}" but the pinned workerd ` +
				`release is "${expected}". Run \`pnpm update:compat-date\` and commit ` +
				`the change to ${DEFAULT_COMPAT_DATE_PATH}.`
		);
		return 1;
	}

	console.log(`DEFAULT_COMPAT_DATE is up to date (${current}).`);
	return 0;
}

if (require.main === module) {
	try {
		if (process.argv[2] === "check") {
			process.exit(checkDefaultCompatDate());
		}
		updateDefaultCompatDate();
		process.exit(0);
	} catch (error) {
		console.error(
			`::error::${error instanceof Error ? error.message : String(error)}`
		);
		process.exit(1);
	}
}
