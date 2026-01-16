/**
 * CLI commands for managing wrangler profiles.
 *
 * Commands:
 * - wrangler profile list: List all profiles
 * - wrangler profile current: Show the active profile
 * - wrangler profile use <name>: Set the project or global profile
 * - wrangler profile delete <name>: Delete a profile
 */

import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import {
	clearGlobalCurrentProfile,
	clearProjectProfile,
	DEFAULT_PROFILE_NAME,
	deleteProfile,
	getProfile,
	isValidProfileName,
	isWranglerProject,
	listProfiles,
	readGlobalCurrentProfile,
	readProjectProfile,
	resolveActiveProfile,
	writeGlobalCurrentProfile,
	writeProjectProfile,
} from "./profile";

/**
 * Namespace for profile commands.
 */
export const profileNamespace = createNamespace({
	metadata: {
		description: "👤 Manage authentication profiles",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
});

/**
 * wrangler profile list
 * List all configured profiles with their status.
 */
export const profileListCommand = createCommand({
	metadata: {
		description: "List all configured profiles",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {},
	async handler() {
		const profiles = listProfiles();

		if (profiles.length === 0) {
			logger.log("No profiles configured.");
			logger.log('Run "wrangler login" to create the default profile.');
			return;
		}

		const { name: activeProfileName, source } = resolveActiveProfile();
		const projectProfile = readProjectProfile();
		const globalProfile = readGlobalCurrentProfile();

		logger.log("Configured profiles:\n");

		// Table header
		logger.log(
			`${"PROFILE".padEnd(20)} ${"STATUS".padEnd(15)} ${"ACCOUNT ID".padEnd(20)}`
		);
		logger.log("-".repeat(60));

		for (const profileName of profiles) {
			const profile = getProfile(profileName);
			const isActive = profileName === activeProfileName;

			// Determine status
			let status = "OK";
			if (profile?.oauth_token && profile?.expiration_time) {
				const expiry = new Date(profile.expiration_time);
				if (expiry < new Date()) {
					status = "Token expired";
				}
			} else if (profile?.api_token) {
				status = "API token";
			} else if (!profile?.oauth_token && !profile?.api_token) {
				status = "No credentials";
			}

			const accountId = profile?.account_id ?? "-";
			const activeMarker = isActive ? " ✓" : "";

			logger.log(
				`${(profileName + activeMarker).padEnd(20)} ${status.padEnd(15)} ${accountId.padEnd(20)}`
			);
		}

		logger.log("");
		logger.log(`Active: ${activeProfileName} (${source})`);

		if (projectProfile) {
			logger.log(`Project profile: ${projectProfile}`);
		}
		if (globalProfile) {
			logger.log(`Global profile: ${globalProfile}`);
		}
	},
});

/**
 * wrangler profile current
 * Show the currently active profile.
 */
export const profileCurrentCommand = createCommand({
	metadata: {
		description: "Show the currently active profile",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {},
	async handler() {
		const projectProfile = readProjectProfile();
		const globalProfile = readGlobalCurrentProfile();
		const { name: activeProfile, source } = resolveActiveProfile();

		if (projectProfile) {
			logger.log(`Project profile: ${projectProfile} (from .wrangler/profile)`);
		} else {
			logger.log("Project profile: (not set)");
		}

		if (globalProfile) {
			logger.log(
				`Global profile:  ${globalProfile} (from ~/.wrangler/current-profile)`
			);
		} else {
			logger.log("Global profile:  (not set)");
		}

		logger.log(`Active:          ${activeProfile} (${source})`);

		// Show profile details if it exists
		const profile = getProfile(activeProfile);
		if (profile) {
			if (profile.account_id) {
				logger.log(`Account ID:      ${profile.account_id}`);
			}
			if (profile.oauth_token) {
				logger.log("Auth type:       OAuth");
				if (profile.expiration_time) {
					const expiry = new Date(profile.expiration_time);
					const isExpired = expiry < new Date();
					logger.log(
						`Token expires:   ${expiry.toISOString()}${isExpired ? " (EXPIRED)" : ""}`
					);
				}
			} else if (profile.api_token) {
				logger.log("Auth type:       API token");
			} else {
				logger.log("Auth type:       (no credentials)");
			}
		} else {
			logger.log(`\nProfile '${activeProfile}' does not exist.`);
			logger.log(
				`Run "wrangler login --profile ${activeProfile}" to create it.`
			);
		}
	},
});

/**
 * wrangler profile use <name>
 * Set the project-level or global profile.
 */
export const profileUseCommand = createCommand({
	metadata: {
		description: "Set the active profile",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "Profile name to use",
			type: "string",
		},
		global: {
			describe: "Set as the global profile instead of project-level",
			type: "boolean",
			default: false,
		},
		clear: {
			describe: "Clear the profile setting instead of setting it",
			type: "boolean",
			default: false,
		},
	},
	async handler(args) {
		const { name, global: isGlobal, clear } = args;

		// Handle --clear flag
		if (clear) {
			if (isGlobal) {
				clearGlobalCurrentProfile();
				logger.log(
					`Cleared global profile. Using '${DEFAULT_PROFILE_NAME}' as default.`
				);
			} else {
				const wasCleared = clearProjectProfile();
				if (wasCleared) {
					const globalProfile =
						readGlobalCurrentProfile() ?? DEFAULT_PROFILE_NAME;
					logger.log(
						`Cleared project profile. Using global profile '${globalProfile}'.`
					);
				} else {
					logger.log("No project profile was set.");
				}
			}
			return;
		}

		// Name is required when not clearing
		if (!name) {
			throw new UserError(
				"Profile name is required. Usage: wrangler profile use <name>"
			);
		}

		// Validate profile name
		if (!isValidProfileName(name)) {
			throw new UserError(
				`Invalid profile name '${name}'. Profile names can only contain alphanumeric characters, dashes, and underscores.`
			);
		}

		// Check if profile exists (warn if not)
		const profile = getProfile(name);
		if (!profile) {
			logger.warn(
				`Profile '${name}' does not exist yet. Run "wrangler login --profile ${name}" to create it.`
			);
		}

		if (isGlobal) {
			// Set global profile
			writeGlobalCurrentProfile(name);
			logger.log(`Set global profile to '${name}'`);
		} else {
			// Set project-level profile
			if (!isWranglerProject()) {
				throw new UserError(
					"No wrangler configuration found in current directory.\n" +
						"Use --global to set the global default profile, or run this command in a wrangler project."
				);
			}
			writeProjectProfile(name);
			logger.log(`Set project profile to '${name}'`);
		}
	},
});

/**
 * wrangler profile delete <name>
 * Delete a profile from the credentials file.
 */
export const profileDeleteCommand = createCommand({
	metadata: {
		description: "Delete a profile",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "Profile name to delete",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args) {
		const { name } = args;

		// Prevent deleting default profile
		if (name === DEFAULT_PROFILE_NAME) {
			throw new UserError(
				"Cannot delete the 'default' profile. You can overwrite it by running 'wrangler login'."
			);
		}

		// Validate profile name
		if (!isValidProfileName(name)) {
			throw new UserError(
				`Invalid profile name '${name}'. Profile names can only contain alphanumeric characters, dashes, and underscores.`
			);
		}

		const wasDeleted = deleteProfile(name);

		if (wasDeleted) {
			logger.log(`Deleted profile '${name}'`);

			// Check if this was the active profile
			const { name: activeProfile } = resolveActiveProfile();
			if (activeProfile === name) {
				logger.warn(
					`Note: '${name}' was your active profile. You may need to run 'wrangler profile use <name>' to select a different profile.`
				);
			}
		} else {
			throw new UserError(`Profile '${name}' does not exist.`);
		}
	},
});
