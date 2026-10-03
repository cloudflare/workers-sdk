export type CliCommands = {
	deploy: string;
	preview: string;
	versionsUpload: string;
	versionsDeploy: string;
	/**
	 * Formats a command that deploys a version at the given traffic percentage.
	 *
	 * @param n Traffic percentage assigned to the version.
	 * @returns The formatted deployment command.
	 */
	versionsDeployAt: (n: number) => string;
	triggersDeploy: string;
	d1List: string;
	d1Delete: string;
	queuesCreate: string;
	secretPut: string;
	versionsSecretPut: string;
	containerRegistryConfigure: string;
};

export type CliConfigFields = {
	containerObservabilityTargetPercentage: string;
	containerObservabilityTargetCount: string;
};

export type CliPresentation = {
	cliName: string;
	displayName: string;
	/** A bare config-file label; callers should supply a determiner such as "your". */
	displayConfigFileName: string;
	commands: CliCommands;
	configFields: CliConfigFields;
};

export type CliPresentationOverrides = Partial<
	Omit<CliPresentation, "commands" | "configFields">
> & {
	commands?: Partial<CliCommands>;
	configFields?: Partial<CliConfigFields>;
};

const WRANGLER_COMMANDS: CliCommands = {
	deploy: "wrangler deploy",
	preview: "wrangler preview",
	versionsUpload: "wrangler versions upload",
	versionsDeploy: "wrangler versions deploy",
	versionsDeployAt: (n) => `wrangler versions deploy <new-version-id>@${n}%`,
	triggersDeploy: "wrangler triggers deploy",
	d1List: "wrangler d1 list",
	d1Delete: "wrangler d1 delete",
	queuesCreate: "wrangler queues create",
	secretPut: "wrangler secret put",
	versionsSecretPut: "wrangler versions secret put",
	containerRegistryConfigure: "wrangler containers registries configure",
};

const WRANGLER_CONFIG_FIELDS: CliConfigFields = {
	containerObservabilityTargetPercentage: "target_instance_percentage",
	containerObservabilityTargetCount: "target_instance_count",
};

export const WRANGLER_CLI_PRESENTATION: CliPresentation = {
	cliName: "wrangler",
	displayName: "Wrangler",
	displayConfigFileName: "Wrangler config file",
	commands: WRANGLER_COMMANDS,
	configFields: WRANGLER_CONFIG_FIELDS,
};

export const CF_CLI_PRESENTATION: CliPresentationOverrides = {
	cliName: "cf",
	displayName: "cf",
	displayConfigFileName: "cloudflare.config.ts",
	configFields: {
		containerObservabilityTargetPercentage: "targetInstancePercentage",
		containerObservabilityTargetCount: "targetInstanceCount",
	},
	commands: {
		deploy: "cf deploy",
		preview: "cf previews deploy",
		versionsUpload: "cf workers versions create",
		versionsDeploy: "cf workers deployments create",
		versionsDeployAt: (n) =>
			`cf workers deployments create --worker <worker-name> --strategy percentage --versions '[{"version_id":"<new-version-id>","percentage":${n}}]'`,
		triggersDeploy: "cf workers triggers deploy",
		d1List: "cf d1 list",
		d1Delete: "cf d1 delete",
		queuesCreate: "cf queues create",
		secretPut: "cf workers secrets update",
		versionsSecretPut: "cf workers secrets update",
		containerRegistryConfigure: "cf containers registries create",
	},
};

/**
 * Resolves consumer-specific CLI copy while retaining Wrangler-compatible
 * defaults for commands the consumer does not implement.
 *
 * @param overrides Consumer-specific names and command spellings.
 * @returns A complete presentation configuration.
 */
export function resolveCliPresentation(
	overrides?: CliPresentationOverrides
): CliPresentation {
	return {
		cliName: overrides?.cliName ?? WRANGLER_CLI_PRESENTATION.cliName,
		displayName:
			overrides?.displayName ?? WRANGLER_CLI_PRESENTATION.displayName,
		displayConfigFileName:
			overrides?.displayConfigFileName ??
			WRANGLER_CLI_PRESENTATION.displayConfigFileName,
		commands: {
			...WRANGLER_COMMANDS,
			...overrides?.commands,
		},
		configFields: {
			...WRANGLER_CONFIG_FIELDS,
			...overrides?.configFields,
		},
	};
}
