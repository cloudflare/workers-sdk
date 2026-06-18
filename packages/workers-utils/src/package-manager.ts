/**
 * Describes a supported package manager and its associated CLI commands
 * and lock file conventions.
 */
export interface PackageManager {
	/** The package manager identifier. */
	type: "npm" | "yarn" | "pnpm" | "bun";
	/** The command used to execute packages (e.g. `npx`, `pnpm`, `bunx`). */
	npx: string;
	/** The command segments used to download and execute packages (e.g. `["npx"]`, `["pnpm", "dlx"]`). */
	dlx: string[];
	/** Lock file names produced by this package manager. */
	lockFiles: string[];
}

/**
 * Manage packages using npm.
 */
export const NpmPackageManager = {
	type: "npm",
	npx: "npx",
	dlx: ["npx"],
	lockFiles: ["package-lock.json"],
} as const satisfies PackageManager;

/**
 * Manage packages using pnpm.
 */
export const PnpmPackageManager = {
	type: "pnpm",
	npx: "pnpm",
	lockFiles: ["pnpm-lock.yaml"],
	dlx: ["pnpm", "dlx"],
} as const satisfies PackageManager;

/**
 * Manage packages using yarn.
 */
export const YarnPackageManager = {
	type: "yarn",
	npx: "yarn",
	dlx: ["yarn", "dlx"],
	lockFiles: ["yarn.lock"],
} as const satisfies PackageManager;

/**
 * Manage packages using bun.
 */
export const BunPackageManager = {
	type: "bun",
	npx: "bunx",
	dlx: ["bunx"],
	lockFiles: ["bun.lockb", "bun.lock"],
} as const satisfies PackageManager;
