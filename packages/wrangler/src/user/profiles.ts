import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { brandColor } from "@cloudflare/cli-shared-helpers/colors";
import {
	getGlobalWranglerConfigPath,
	readFileSync,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { createCommand, createNamespace } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { getWranglerProfileFromEnv } from "./auth-variables";
import { handleScopesArgs, loginArgs } from "./login-shared";
import {
	getAuthConfigFilePath,
	login,
	readAuthConfigFile,
	revokeToken,
	USER_AUTH_CONFIG_PATH,
	type Scope,
} from "./user";

export const PROFILES_DIR = "profiles";

/**
 * The file that tracks which profile is currently active.
 */
const ACTIVE_PROFILE_FILE = "active.json";

/**
 * The file that stores directory-to-profile bindings.
 */
const PROJECTS_FILE = "projects.json";

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

const MAX_PROFILE_NAME_LENGTH = 64;

const RESERVED_PROFILE_NAMES = ["default"];

export function validateProfileName(name: string): void {
	const errors = [];
	if (name.length > MAX_PROFILE_NAME_LENGTH) {
		errors.push(
			`Profile name must be at most ${MAX_PROFILE_NAME_LENGTH} characters.`
		);
	}
	if (!PROFILE_NAME_PATTERN.test(name)) {
		errors.push(
			`Profile name "${name}" is invalid. Only letters, numbers, hyphens, and underscores are allowed.`
		);
	}
	if (RESERVED_PROFILE_NAMES.includes(name)) {
		errors.push(
			`Profile name "${name}" is reserved. Please choose a different name.`
		);
	}
	if (errors.length > 0) {
		throw new UserError(errors.join("\n"), {
			telemetryMessage: "profile name invalid",
		});
	}
}

function getConfigDir(): string {
	return path.join(getGlobalWranglerConfigPath(), USER_AUTH_CONFIG_PATH);
}

// ---------------------------------------------------------------------------
// Active profile config (active.json)
// ---------------------------------------------------------------------------

/**
 * Resolve the active profile name.
 *
 * Priority (highest to lowest):
 * 1. `WRANGLER_PROFILE` environment variable
 * 2. Directory binding (walk up from cwd)
 * 3. `active_profile` from `~/.wrangler/config/active.json`
 * 4. `"default"`
 */
export function getActiveProfileName(): string | undefined {
	const envProfile = getWranglerProfileFromEnv();
	if (envProfile) {
		return envProfile;
	}

	const dirProfile = getProfileForDirectory();
	if (dirProfile) {
		return dirProfile;
	}

	const activeProfileFromConfig = getActiveProfileFromConfig();
	if (activeProfileFromConfig) {
		return activeProfileFromConfig;
	}

	return undefined;
}

/**
 * Read the `active_profile` value directly from `active.json`,
 * ignoring environment variables and directory bindings.
 * Returns `undefined` when active.json doesn't exist or the
 * active profile is "default".
 */
function getActiveProfileFromConfig(): string | undefined {
	try {
		const filePath = path.join(getConfigDir(), ACTIVE_PROFILE_FILE);
		const content = JSON.parse(readFileSync(filePath)) as {
			active_profile?: string;
		};
		if (content.active_profile && content.active_profile !== "default") {
			return content.active_profile;
		}
	} catch {
		// active.json doesn't exist; that's fine
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Directory-to-profile bindings (projects.json)
// ---------------------------------------------------------------------------

interface ProjectEntry {
	[directory: string]: { profile: string };
}

interface ProjectsFile {
	projects: ProjectEntry[];
}

function getProjectsFilePath(): string {
	return path.join(getConfigDir(), PROJECTS_FILE);
}

/**
 * Read directory-to-profile bindings from disk.
 * Returns an empty object if the file doesn't exist.
 */
export function readDirectoryBindings(): Record<string, string> {
	try {
		const data = JSON.parse(
			readFileSync(getProjectsFilePath())
		) as ProjectsFile;
		const result: Record<string, string> = {};
		for (const entry of data.projects ?? []) {
			for (const [dir, config] of Object.entries(entry)) {
				result[dir] = config.profile;
			}
		}
		return result;
	} catch {
		return {};
	}
}

/**
 * Writes a mapping of which profiles to use in each directory
 */
export function writeDirectoryBindings(bindings: Record<string, string>): void {
	const filePath = getProjectsFilePath();
	mkdirSync(path.dirname(filePath), { recursive: true });
	const data: ProjectsFile = {
		projects: Object.entries(bindings).map(([dir, profile]) => ({
			[dir]: { profile },
		})),
	};
	writeFileSync(filePath, JSON.stringify(data, null, "\t"), {
		encoding: "utf-8",
	});
}

/**
 * Look up the profile bound to the given directory (or an ancestor).
 * Checks each binding to see if `dir` (defaults to `process.cwd()`)
 * falls within a bound directory, and returns the most specific match.
 */
export function getProfileForDirectory(dir?: string): string | undefined {
	const bindings = readDirectoryBindings();
	const resolved = path.resolve(dir ?? process.cwd());

	let bestMatch: string | undefined;
	// we want to pick the most specific match
	let bestLength = 0;

	for (const [boundDir, profile] of Object.entries(bindings)) {
		if (resolved === boundDir) {
			return profile;
		}
		if (resolved.startsWith(boundDir + path.sep)) {
			if (boundDir.length > bestLength) {
				bestMatch = profile;
				bestLength = boundDir.length;
			}
		}
	}

	return bestMatch;
}

/**
 * Remove all directory bindings that point to a given profile.
 */
export function cleanupDirectoryBindingsForProfile(name: string): void {
	const bindings = readDirectoryBindings();
	let changed = false;
	for (const [dir, profile] of Object.entries(bindings)) {
		if (profile === name) {
			delete bindings[dir];
			changed = true;
		}
	}
	if (changed) {
		writeDirectoryBindings(bindings);
	}
}

/**
 * Remove the directory binding for a specific directory.
 * Returns `true` if a binding was removed, `false` if none existed.
 */
export function removeDirectoryBinding(dir: string): boolean {
	const resolved = path.resolve(dir);
	const bindings = readDirectoryBindings();
	// we want an exact match
	if (!(resolved in bindings)) {
		return false;
	}
	delete bindings[resolved];
	writeDirectoryBindings(bindings);
	return true;
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

/**
 * Check whether a named profile exists on disk.
 */
export function profileExists(name: string): boolean {
	return existsSync(getAuthConfigFilePath(name));
}

/**
 * List all available profiles.
 * Always includes "default" as the first entry.
 */
export function listProfiles(): string[] {
	// TODO: this should show what accounts are associated with each profile
	const profiles: string[] = [];
	try {
		const profilesDir = path.join(getConfigDir(), PROFILES_DIR);
		if (existsSync(profilesDir)) {
			const files = readdirSync(profilesDir);
			for (const file of files) {
				if (file.endsWith(".toml")) {
					const name = file.slice(0, -".toml".length);
					if (name && PROFILE_NAME_PATTERN.test(name)) {
						profiles.push(name);
					}
				}
			}
		}
	} catch {
		// If we can't read the profiles directory, just return what we have
	}
	return profiles;
}

/**
 * Set the active profile in the active.json manifest.
 */
export function setActiveProfile(name: string): void {
	const filePath = path.join(getConfigDir(), ACTIVE_PROFILE_FILE);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(
		filePath,
		JSON.stringify({ active_profile: name }, null, "\t"),
		{ encoding: "utf-8" }
	);
}
/**
 * Unset the active profile by removing the active.json manifest.
 */
export function unsetActiveProfile(): void {
	const filePath = path.join(getConfigDir(), ACTIVE_PROFILE_FILE);
	rmSync(filePath, { force: true });
}

/**
 * Delete a named profile.
 * Cannot delete the "default" profile.
 */
export function deleteProfile(name: string): void {
	const profilePath = getAuthConfigFilePath(name);

	rmSync(profilePath);

	cleanupDirectoryBindingsForProfile(name);

	// If this was the active profile in active.json, reset to default.
	// Use getActiveProfileFromConfig() instead of getActiveProfile() so that
	// WRANGLER_PROFILE and directory bindings don't mask the check.
	if (getActiveProfileFromConfig() === name) {
		setActiveProfile("default");
	}
}

// ---------------------------------------------------------------------------
// Profile CLI commands
// ---------------------------------------------------------------------------

export const profileNamespace = createNamespace({
	metadata: {
		description: "🔀 Manage authentication profiles for multiple accounts",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
		category: "Account",
	},
});

export const profileListCommand = createCommand({
	metadata: {
		description: "List all authentication profiles",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
	},
	behaviour: {
		printActiveProfile: false,
		printConfigWarnings: false,
		provideConfig: false,
	},
	async handler() {
		const profiles = listProfiles();
		const active = getActiveProfileName();

		// Invert directory bindings to profile → dirs[]
		const bindings = readDirectoryBindings();
		const dirsByProfile = new Map<string, string[]>();
		for (const [dir, profile] of Object.entries(bindings)) {
			const dirs = dirsByProfile.get(profile) ?? [];
			dirs.push(dir);
			dirsByProfile.set(profile, dirs);
		}

		const sorted = [...profiles.filter((p) => p !== "default")];
		if (sorted.length === 0) {
			logger.log(
				"No profiles found. You can create a profile by running `wrangler profiles create <profile name>`.\n"
			);
		}

		for (const name of sorted) {
			const isActive = name === active;

			const label = isActive ? `${name} (active)` : name;
			const styledName = isActive ? brandColor(label) : chalk.gray(label);

			logger.log(styledName);

			const dirs = dirsByProfile.get(name) ?? [];
			for (const dir of dirs) {
				logger.log(`  - ${chalk.dim(dir)}`);
			}
		}
		logger.log("\n");
	},
});

export const profileCreateCommand = createCommand({
	metadata: {
		description: "Create a new authentication profile and log in",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
	},
	behaviour: {
		printActiveProfile: false,
		printConfigWarnings: false,
	},
	args: {
		name: {
			describe: "Name of the profile to create",
			type: "string",
			demandOption: true,
		},
		...loginArgs,
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (handleScopesArgs(args)) {
			return;
		}

		validateProfileName(args.name);

		if (profileExists(args.name)) {
			throw new UserError(
				`Profile "${args.name}" already exists.\nDelete it first with \`wrangler profiles delete ${args.name}\` and recreate it.`,
				{ telemetryMessage: "profile create already exists" }
			);
		}

		logger.log(`Creating profile "${args.name}"...\n`);

		const success = await login(config, {
			scopes: args.scopes as Scope[] | undefined,
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
			profile: args.name,
		});

		if (!success) {
			return;
		}

		logger.log(`✨ Successfully created profile "${args.name}".\n`);

		if (getActiveProfileName() !== args.name) {
			const shouldActivate = await confirm(
				`Do you want to set "${args.name}" as the active profile?`,
				{ fallbackValue: false }
			);
			if (shouldActivate) {
				setActiveProfile(args.name);
				logger.log(`✨ Switched to profile "${args.name}".\n`);
			}
		}
	},
});

export const profileSetCommand = createCommand({
	metadata: {
		description: "Switch the active authentication profile",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
	},
	behaviour: {
		printActiveProfile: false,
		printConfigWarnings: false,
		provideConfig: false,
	},
	args: {
		name: {
			describe: "Name of the profile to switch to",
			type: "string",
			demandOption: true,
		},
		dir: {
			describe:
				"Bind a directory to this profile instead of setting it globally. Defaults to the current working directory.",
			type: "string",
		},
	},
	positionalArgs: ["name"],
	async handler(args) {
		validateProfileName(args.name);
		if (!profileExists(args.name)) {
			throw new UserError(
				`Profile "${args.name}" does not exist.\nRun \`wrangler profiles create ${args.name}\` to create it.`,
				{ telemetryMessage: "profile set not found" }
			);
		}

		if (args.dir !== undefined) {
			const dir = path.resolve(args.dir || process.cwd());
			const bindings = readDirectoryBindings();
			bindings[dir] = args.name;
			writeDirectoryBindings(bindings);
			logger.log(`✨ Bound directory "${dir}" to profile "${args.name}".\n`);
		} else {
			setActiveProfile(args.name);
			logger.log(`✨ Switched to profile "${args.name}".\n`);
		}
	},
});

export const profileDeleteCommand = createCommand({
	metadata: {
		description: "Delete an authentication profile",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
	},
	behaviour: {
		printActiveProfile: false,
		printConfigWarnings: false,
		provideConfig: false,
	},
	args: {
		name: {
			describe: "Name of the profile to delete",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	validateArgs(args) {
		if (args.name === "default") {
			throw new UserError(
				"Cannot delete the default profile. Use `wrangler logout` instead.",
				{ telemetryMessage: "profile delete default forbidden" }
			);
		}
		if (!profileExists(args.name)) {
			throw new UserError(`Profile "${args.name}" does not exist.`, {
				telemetryMessage: "profile delete not found",
			});
		}
	},
	async handler(args) {
		const token = readAuthConfigFile(args.name).refresh_token;
		if (token) {
			await revokeToken(token);
		} else {
			logger.warn(
				`No refresh token found for profile "${args.name}". The token could not be revoked and may still be valid.`
			);
		}
		deleteProfile(args.name);
		logger.log(`✅ Deleted profile "${args.name}".\n`);
	},
});

export const profileUnsetCommand = createCommand({
	metadata: {
		description:
			"Reset the active profile to default, or remove a directory-to-profile binding",
		owner: "Workers: Authoring and Testing",
		status: "open beta",
	},
	behaviour: {
		printActiveProfile: false,
		printConfigWarnings: false,
		provideConfig: false,
	},
	args: {
		dir: {
			describe:
				"If provided, unsets the profile bound to the specified directory. If not provided, unsets the global active profile.",
			type: "string",
		},
	},
	async handler(args) {
		if (args.dir !== undefined) {
			// Unbind a specific directory
			const dir = path.resolve(args.dir || process.cwd());
			const removed = removeDirectoryBinding(dir);
			if (!removed) {
				throw new UserError(
					`No profile is set for directory "${dir}". Run \`wrangler profiles list\` to see existing profiles and their associated directories.`,
					{
						telemetryMessage: "profile unset no binding",
					}
				);
			}
			logger.log(`✅ Unset profile for directory "${dir}".\n`);
		} else {
			// unset the global active profile
			const envProfile = getWranglerProfileFromEnv();
			if (envProfile) {
				throw new UserError(
					`The active profile "${envProfile}" is set via the WRANGLER_PROFILE environment variable.\n`,
					{ telemetryMessage: "profile unset env var" }
				);
			}

			const dirProfile = getProfileForDirectory(process.cwd());
			if (dirProfile) {
				logger.warn(
					`This directory is bound to the profile "${dirProfile}" via a directory binding.\nRunning \`wrangler profiles unset\` without the --dir flag will only unset the globally active profile.\nThe directory binding will still apply.`
				);
			}

			const current = getActiveProfileFromConfig();
			if (!current) {
				logger.log("Already using the default profile.");
				return;
			}
			unsetActiveProfile();
			logger.log(
				`✅ Switched from profile "${current}" back to the default profile.\n`
			);
		}
	},
});
