import path from "node:path";
import { validateProfileName } from "@cloudflare/workers-auth";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { oauthArgs } from "./commands";
import { createWranglerProfileStore } from "./profile-store";
import { getAuthFromEnv, login, logout, validateScopeKeys } from "./user";

function assertNoEnvCredentials() {
	if (getAuthFromEnv() === undefined) {
		return;
	}

	throw new UserError(
		"Cannot manage auth profiles while CLOUDFLARE_API_TOKEN is set. Unset CLOUDFLARE_API_TOKEN and try again.",
		{
			telemetryMessage:
				"profile mutation command used when api token provided via env var",
		}
	);
}

export const authProfilesNamespace = createNamespace({
	metadata: {
		description: "Manage auth profiles",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
	},
});

function rejectProfileFlag(args: { profile?: string }, message: string): void {
	if (args.profile) {
		throw new UserError(message, {
			telemetryMessage: "profile flag used on invalid auth command",
		});
	}
}

export const authCreateCommand = createCommand({
	metadata: {
		description: "Create or re-authenticate a named auth profile",
		owner: "Workers: Authoring and Testing",
		status: "experimental",
		category: "Account",
		hideGlobalFlags: ["profile"],
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
	validateArgs(args) {
		rejectProfileFlag(
			args,
			"The --profile flag cannot be used with `wrangler auth create`. Pass the profile name as the command argument: `wrangler auth create <name>`."
		);
	},
	async handler(args, { config }) {
		assertNoEnvCredentials();
		const profiles = createWranglerProfileStore();
		validateProfileName(args.name);

		if (args.scopes) {
			if (!validateScopeKeys(args.scopes)) {
				throw new UserError(
					`One of ${args.scopes} is not a valid authentication scope. Run "wrangler login ${args.name} --scopes-list" to see the valid scopes.`,
					{ telemetryMessage: "auth profile create invalid scope" }
				);
			}
		}

		const isUpdate = profiles.configs.exists(args.name);

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
		assertNoEnvCredentials();
		const profiles = createWranglerProfileStore();
		validateProfileName(args.name);

		if (!profiles.configs.exists(args.name)) {
			throw new UserError(`Profile "${args.name}" does not exist.`, {
				telemetryMessage: "auth profile delete not found",
			});
		}

		const removedBindings = profiles.bindings.removeAllBindingsForProfile(
			args.name
		);
		if (removedBindings.length > 0) {
			logger.log("Removed directory bindings:");
			for (const dir of removedBindings) {
				logger.log(`  ${dir}`);
			}
		}

		await logout(args.name);
		profiles.configs.delete(args.name);

		logger.log(`Profile "${args.name}" deleted.`);

		const currentProfile = profiles.bindings.getProfileForDirectory(
			process.cwd()
		);
		if (currentProfile) {
			logger.log(`Active profile for this directory: ${currentProfile}.`);
		} else if (profiles.configs.exists("default")) {
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
		hideGlobalFlags: ["profile"],
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
	validateArgs(args) {
		rejectProfileFlag(
			args,
			"The --profile flag cannot be used with `wrangler auth activate`. Pass the profile name as the command argument: `wrangler auth activate <name>`."
		);
	},
	async handler(args) {
		assertNoEnvCredentials();
		const profiles = createWranglerProfileStore();
		validateProfileName(args.name);

		const targetDir = args.dir ?? process.cwd();

		if (!profiles.configs.exists(args.name)) {
			throw new UserError(
				`Profile "${args.name}" does not exist. Run \`wrangler auth create ${args.name}\` first.`,
				{ telemetryMessage: "auth activate profile not found" }
			);
		}

		profiles.bindings.activate(args.name, targetDir);
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
		hideGlobalFlags: ["profile"],
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
	validateArgs(args) {
		rejectProfileFlag(
			args,
			"The --profile flag cannot be used with `wrangler auth deactivate`. To switch profiles, run `wrangler auth activate <name>`; to remove this directory's binding, run `wrangler auth deactivate` without --profile."
		);
	},
	async handler(args) {
		assertNoEnvCredentials();
		const profiles = createWranglerProfileStore();
		const targetDir = args.dir ?? process.cwd();
		const normalizedTargetDir = path.resolve(targetDir);
		const { removedProfile, newResolution } =
			profiles.bindings.deactivate(targetDir);

		logger.log(
			`Profile "${removedProfile}" deactivated from "${normalizedTargetDir}".`
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
		const profiles = createWranglerProfileStore();
		const profileNames = profiles.configs.list();

		if (profileNames.length === 0) {
			logger.log("No profiles found. Run `wrangler login` to get started.");
			return;
		}

		const bindings = profiles.bindings.read();
		const bindingsByProfile: Record<string, string[]> = {};
		for (const [dir, profile] of Object.entries(bindings)) {
			if (!bindingsByProfile[profile]) {
				bindingsByProfile[profile] = [];
			}
			bindingsByProfile[profile].push(dir);
		}

		const data = profileNames.map((name) => ({
			Profile: name,
			"Bound Directories": (bindingsByProfile[name] ?? []).join(", ") || "-",
		}));

		logger.table(data);
	},
});
