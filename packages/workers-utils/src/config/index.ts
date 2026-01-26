import TOML from "smol-toml";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import { resolveWranglerConfigPath } from "./config-helpers";
import type { Config, RawConfig } from "./config";
import type { ResolveConfigPathOptions } from "./config-helpers";
import type { NormalizeAndValidateConfigArgs } from "./validation";

export type {
	Config,
	ConfigFields,
	DevConfig,
	RawConfig,
	RawDevConfig,
} from "./config";
export type {
	ConfigModuleRuleType,
	Environment,
	RawEnvironment,
} from "./environment";

export function configFormat(
	configPath: string | undefined
): "json" | "jsonc" | "toml" | "none" {
	if (configPath?.endsWith("toml")) {
		return "toml";
	}
	if (configPath?.endsWith("jsonc")) {
		return "jsonc";
	}
	if (configPath?.endsWith("json")) {
		return "json";
	}
	return "none";
}

export function configFileName(configPath: string | undefined) {
	const format = configFormat(configPath);
	switch (format) {
		case "toml":
			return "wrangler.toml";
		case "json":
			return "wrangler.json";
		case "jsonc":
			return "wrangler.jsonc";
		default:
			return "Wrangler configuration";
	}
}

export function formatConfigSnippet(
	snippet: RawConfig,
	configPath: Config["configPath"],
	formatted = true
) {
	const format = configFormat(configPath);
	if (format === "toml") {
		return TOML.stringify(snippet);
	} else {
		return formatted
			? JSON.stringify(snippet, null, 2)
			: JSON.stringify(snippet);
	}
}

export const sharedResourceCreationArgs = {
	"use-remote": {
		type: "boolean",
		description:
			"Use a remote binding when adding the newly created resource to your config",
	},
	"update-config": {
		type: "boolean",
		description:
			"Automatically update your config file with the newly added resource",
	},
	binding: {
		type: "string",
		description: "The binding name of this resource in your Worker",
	},
} as const;

export type ReadConfigCommandArgs = NormalizeAndValidateConfigArgs & {
	config?: string;
	script?: string;
};

export type ReadConfigOptions = ResolveConfigPathOptions & {
	hideWarnings?: boolean;
	// Used by the Vite plugin
	// If set to `true`, the `main` field is not converted to an absolute path
	preserveOriginalMain?: boolean;
};

export type ConfigBindingOptions = Pick<
	Config,
	| "ai"
	| "browser"
	| "d1_databases"
	| "dispatch_namespaces"
	| "durable_objects"
	| "queues"
	| "r2_buckets"
	| "services"
	| "kv_namespaces"
	| "mtls_certificates"
	| "vectorize"
	| "workflows"
	| "vpc_services"
>;

const parseRawConfigFile = (configPath: string): RawConfig => {
	if (configPath.endsWith(".toml")) {
		return parseTOML(readFileSync(configPath), configPath) as RawConfig;
	}

	if (configPath.endsWith(".json") || configPath.endsWith(".jsonc")) {
		return parseJSONC(readFileSync(configPath), configPath) as RawConfig;
	}

	return {};
};

export const experimental_readRawConfig = (
	args: ReadConfigCommandArgs,
	options: ReadConfigOptions = {}
): {
	rawConfig: RawConfig;
	configPath: string | undefined;
	userConfigPath: string | undefined;
	deployConfigPath: string | undefined;
	redirected: boolean;
} => {
	// Load the configuration from disk if available
	const { configPath, userConfigPath, deployConfigPath, redirected } =
		resolveWranglerConfigPath(args, options);

	const rawConfig = parseRawConfigFile(configPath ?? "");

	return {
		rawConfig,
		configPath,
		userConfigPath,
		deployConfigPath,
		redirected,
	};
};
