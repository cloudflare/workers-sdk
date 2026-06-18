import path from "node:path";
import {
	activateProfileForDirectory,
	deactivateDirectory,
	getProfileForDirectory,
	listProfiles,
	profileExists,
	readDirectoryBindings,
	removeAllBindingsForProfile,
	validateProfileName,
} from "@cloudflare/workers-auth";
import {
	getGlobalWranglerConfigPath,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { oauthArgs } from "./commands";
import {
	getAuthFromEnv,
	listScopes,
	login,
	logout,
	validateScopeKeys,
} from "./user";

function assertNoEnvCredentials(action: "create" | "delete", profile: string) {
	const envAuth = getAuthFromEnv();
	if (envAuth === undefined) {
		return;
	}

	const isApiToken = "apiToken" in envAuth;
	const envVars = isApiToken
		? "CLOUDFLARE_API_TOKEN"
		: "CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL";
	throw new UserError(
		`Cannot ${action} auth profile "${profile}" while ${envVars} ${isApiToken ? "is" : "are"} set. Unset ${envVars} and try again.`,
		{
			telemetryMessage:
				action === "create"
					? "auth profile create env credentials"
					: "auth profile delete env credentials",
		}
	);
}

function configDir(): string {
	return getGlobalWranglerConfigPath();
}

export const authProfilesNamespace = createNamespace({
	metadata: {
		description: "Manage auth profiles",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
});

export const authCreateCommand = createCommand({
	metadata: {
		description: "Create or re-authenticate a named auth profile",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		printActiveProfile: false,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "Name for the auth profile",
			type: "string",
			demandOption: true,
		},
		...oauthArgs,
	},
	async handler(args, { config }) {
		validateProfileName(args.name);

		if (args.scopesList) {
			listScopes();
			return;
		}

		if (args.scopes) {
			if (args.scopes.length === 0) {
				listScopes();
				return;
			}
			if (!validateScopeKeys(args.scopes)) {
				throw new UserError(
					`One of ${args.scopes} is not a valid authentication scope. Run "wrangler auth create ${args.name} --scopes-list" to see the valid scopes.`,
					{ telemetryMessage: "auth profile create invalid scope" }
				);
			}
		}

		assertNoEnvCredentials("create", args.name);

		const isUpdate = profileExists(configDir(), args.name);

		await login(config, {
			scopes: args.scopes,
			browser: args.browser,
			callbackHost: args.callbackHost,
			callbackPort: args.callbackPort,
			profile: args.name,
		});

		if (isUpdate) {
			logger.log(`Profile "${args.name}" re-authenticated.`);
		} else {
			logger.log(`Profile "${args.name}" created.`);
		}
		logger.log(
			`Run \`wrangler auth activate ${args.name}\` to use this profile in a directory.`
		);
	},
});

export const authDeleteCommand = createCommand({
	metadata: {
		description: "Delete a named auth profile",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		printActiveProfile: false,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "Name of the auth profile to delete",
			type: "string",
			demandOption: true,
		},
	},
	async handler(args) {
		validateProfileName(args.name);

		if (!profileExists(configDir(), args.name)) {
			throw new UserError(`Profile "${args.name}" does not exist.`, {
				telemetryMessage: "auth profile delete not found",
			});
		}

		assertNoEnvCredentials("delete", args.name);

		const removedBindings = removeAllBindingsForProfile(configDir(), args.name);
		if (removedBindings.length > 0) {
			logger.log("Removed directory bindings:");
			for (const dir of removedBindings) {
				logger.log(`  ${dir}`);
			}
		}

		await logout(args.name);

		logger.log(`Profile "${args.name}" deleted.`);

		const currentProfile = getProfileForDirectory(configDir(), process.cwd());
		if (currentProfile) {
			logger.log(`Active profile for this directory: ${currentProfile}.`);
		} else if (profileExists(configDir(), "default")) {
			logger.log("This directory now uses the default profile.");
		} else {
			logger.log(
				"No active profile for this directory. Run `wrangler login` to set up the default profile, or `wrangler auth create <name>` to create a named profile."
			);
		}
	},
});

export const authActivateCommand = createCommand({
	metadata: {
		description: "Bind a named auth profile to a directory",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		printActiveProfile: false,
	},
	positionalArgs: ["name", "dir"],
	args: {
		name: {
			describe: "Name of the auth profile to activate",
			type: "string",
			demandOption: true,
		},
		dir: {
			describe:
				"Directory to bind the profile to (defaults to current directory)",
			type: "string",
		},
	},
	async handler(args) {
		validateProfileName(args.name);

		const targetDir = args.dir ?? process.cwd();

		if (!profileExists(configDir(), args.name)) {
			throw new UserError(
				`Profile "${args.name}" does not exist. Run \`wrangler auth create ${args.name}\` first.`,
				{ telemetryMessage: "auth activate profile not found" }
			);
		}

		activateProfileForDirectory(configDir(), args.name, targetDir);
		logger.log(
			`Profile "${args.name}" activated for "${path.resolve(targetDir)}".`
		);
	},
});

export const authDeactivateCommand = createCommand({
	metadata: {
		description: "Remove the auth profile binding from a directory",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		printActiveProfile: false,
	},
	positionalArgs: ["dir"],
	args: {
		dir: {
			describe:
				"Directory to unbind (defaults to current directory). Must be the exact directory the profile was bound to.",
			type: "string",
		},
	},
	async handler(args) {
		const targetDir = args.dir ?? process.cwd();
		const { removedProfile, newResolution } = deactivateDirectory(
			configDir(),
			targetDir
		);

		logger.log(
			`Profile "${removedProfile}" deactivated from "${path.resolve(targetDir)}".`
		);
		if (newResolution.profile === undefined) {
			logger.log(
				"No active profile for this directory. Run `wrangler login` to set up the default profile, or `wrangler auth create <name>` to create a named profile."
			);
		} else if (newResolution.profile === "default") {
			logger.log("This directory now uses the default profile.");
		} else {
			logger.log(
				`Now using: ${newResolution.profile} (${newResolution.source}).`
			);
		}
	},
});

// TODO: show what accounts are connected
export const authListCommand = createCommand({
	metadata: {
		description: "List all auth profiles",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
		hideGlobalFlags: ["profile"],
	},
	behaviour: {
		printConfigWarnings: false,
		provideConfig: false,
		printActiveProfile: false,
	},
	validateArgs(args) {
		if (args.profile) {
			throw new UserError(
				"The --profile flag cannot be used with `wrangler auth list`.",
				{ telemetryMessage: "auth list rejects --profile flag" }
			);
		}
	},
	async handler() {
		const profiles = listProfiles(configDir());

		if (profiles.length === 0) {
			logger.log("No profiles found. Run `wrangler login` to get started.");
			return;
		}

		const bindings = readDirectoryBindings(configDir());
		const bindingsByProfile: Record<string, string[]> = {};
		for (const [dir, profile] of Object.entries(bindings)) {
			if (!bindingsByProfile[profile]) {
				bindingsByProfile[profile] = [];
			}
			bindingsByProfile[profile].push(dir);
		}

		const data = profiles.map((name) => ({
			Profile: name,
			"Bound Directories": (bindingsByProfile[name] ?? []).join(", ") || "-",
		}));

		logger.table(data);
	},
});
