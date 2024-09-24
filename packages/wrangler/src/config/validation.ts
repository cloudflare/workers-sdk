import assert from "node:assert";
import path from "node:path";
import TOML from "@iarna/toml";
import { dedent } from "ts-dedent";
import { Diagnostics } from "./diagnostics";
import {
	all,
	appendEnvName,
	deprecated,
	experimental,
	getBindingNames,
	hasProperty,
	inheritable,
	inheritableInLegacyEnvironments,
	isBoolean,
	isMutuallyExclusiveWith,
	isNonEmptyString,
	isObjectWith,
	isOneOf,
	isOptionalProperty,
	isRequiredProperty,
	isString,
	isStringArray,
	isValidName,
	notInheritable,
	validateAdditionalProperties,
	validateOptionalProperty,
	validateOptionalTypedArray,
	validateRequiredProperty,
	validateTypedArray,
} from "./validation-helpers";
import type { Config, DevConfig, RawConfig, RawDevConfig } from "./config";
import type {
	Assets,
	DeprecatedUpload,
	DispatchNamespaceOutbound,
	Environment,
	Observability,
	RawEnvironment,
	Rule,
	TailConsumer,
} from "./environment";
import type { TypeofType, ValidatorFn } from "./validation-helpers";

export type NormalizeAndValidateConfigArgs = {
	name?: string;
	env?: string;
	"legacy-env"?: boolean;
	// This is not relevant in dev. It's only purpose is loosening Worker name validation when deploying to a dispatch namespace
	"dispatch-namespace"?: string;
	remote?: boolean;
	localProtocol?: string;
	upstreamProtocol?: string;
};

const ENGLISH = new Intl.ListFormat("en-US");

export function isPagesConfig(rawConfig: RawConfig): boolean {
	return rawConfig.pages_build_output_dir !== undefined;
}

/**
 * Validate the given `rawConfig` object that was loaded from `configPath`.
 *
 * The configuration is normalized, which includes using default values for missing field,
 * and copying over inheritable fields into named environments.
 *
 * Any errors or warnings from the validation are available in the returned `diagnostics` object.
 */
export function normalizeAndValidateConfig(
	rawConfig: RawConfig,
	configPath: string | undefined,
	args: NormalizeAndValidateConfigArgs
): {
	config: Config;
	diagnostics: Diagnostics;
} {
	const diagnostics = new Diagnostics(
		`Processing ${
			configPath ? path.relative(process.cwd(), configPath) : "wrangler"
		} configuration:`
	);

	deprecated(
		diagnostics,
		rawConfig,
		"miniflare",
		"Wrangler does not use configuration in the `miniflare` section. Unless you are using Miniflare directly you can remove this section.",
		true,
		"😶 Ignored"
	);

	deprecated(
		diagnostics,
		rawConfig,
		"type",
		"Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.",
		true,
		"😶 Ignored"
	);

	deprecated(
		diagnostics,
		rawConfig,
		"webpack_config",
		"Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.",
		true,
		"😶 Ignored"
	);

	validateOptionalProperty(
		diagnostics,
		"",
		"legacy_env",
		rawConfig.legacy_env,
		"boolean"
	);

	validateOptionalProperty(
		diagnostics,
		"",
		"send_metrics",
		rawConfig.send_metrics,
		"boolean"
	);

	validateOptionalProperty(
		diagnostics,
		"",
		"keep_vars",
		rawConfig.keep_vars,
		"boolean"
	);

	validateOptionalProperty(
		diagnostics,
		"",
		"pages_build_output_dir",
		rawConfig.pages_build_output_dir,
		"string"
	);

	// Support explicit JSON schema setting
	validateOptionalProperty(
		diagnostics,
		"",
		"$schema",
		rawConfig.$schema,
		"string"
	);

	// TODO: set the default to false to turn on service environments as the default
	const isLegacyEnv =
		typeof args["legacy-env"] === "boolean"
			? args["legacy-env"]
			: rawConfig.legacy_env ?? true;

	// TODO: remove this once service environments goes GA.
	if (!isLegacyEnv) {
		diagnostics.warnings.push(
			"Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
		);
	}

	const isDispatchNamespace =
		typeof args["dispatch-namespace"] === "string" &&
		args["dispatch-namespace"].trim() !== "";

	const topLevelEnv = normalizeAndValidateEnvironment(
		diagnostics,
		configPath,
		rawConfig,
		isDispatchNamespace
	);

	//TODO: find a better way to define the type of Args that can be passed to the normalizeAndValidateConfig()
	const envName = args.env;
	assert(envName === undefined || typeof envName === "string");

	let activeEnv = topLevelEnv;

	if (envName !== undefined) {
		const envDiagnostics = new Diagnostics(
			`"env.${envName}" environment configuration`
		);
		const rawEnv = rawConfig.env?.[envName];

		/**
		 * If an environment name was specified, and we found corresponding configuration
		 * for it in the config file, we will use that corresponding environment. If the
		 * environment name was specified, but no configuration for it was found, we will:
		 *
		 * - default to the top-level environment for Pages. For Pages, Wrangler does not
		 * require both of supported named environments ("preview" or "production") to be
		 * explicitly defined in the config file. If either`[env.production]` or
		 * `[env.preview]` is left unspecified, we will use the top-level environment when
		 * targeting that named Pages environment.
		 *
		 * - create a fake active environment with the specified `envName` for Workers.
		 * This is done to cover any legacy environment cases, where the `envName` is used.
		 */
		if (rawEnv !== undefined) {
			activeEnv = normalizeAndValidateEnvironment(
				envDiagnostics,
				configPath,
				rawEnv,
				isDispatchNamespace,
				envName,
				topLevelEnv,
				isLegacyEnv,
				rawConfig
			);
			diagnostics.addChild(envDiagnostics);
		} else if (!isPagesConfig(rawConfig)) {
			activeEnv = normalizeAndValidateEnvironment(
				envDiagnostics,
				configPath,
				{},
				isDispatchNamespace,
				envName,
				topLevelEnv,
				isLegacyEnv,
				rawConfig
			);
			const envNames = rawConfig.env
				? `The available configured environment names are: ${JSON.stringify(
						Object.keys(rawConfig.env)
					)}\n`
				: "";
			const message =
				`No environment found in configuration with name "${envName}".\n` +
				`Before using \`--env=${envName}\` there should be an equivalent environment section in the configuration.\n` +
				`${envNames}\n` +
				`Consider adding an environment configuration section to the wrangler.toml file:\n` +
				"```\n[env." +
				envName +
				"]\n```\n";

			if (envNames.length > 0) {
				diagnostics.errors.push(message);
			} else {
				// Only warn (rather than error) if there are not actually any environments configured in wrangler.toml.
				diagnostics.warnings.push(message);
			}
		}
	}

	deprecated(
		diagnostics,
		rawConfig,
		"legacy_assets",
		`The \`legacy_assets\` feature has been deprecated. Please use \`assets\` instead.`,
		false
	);

	// Process the top-level default environment configuration.
	const config: Config = {
		configPath,
		pages_build_output_dir: normalizeAndValidatePagesBuildOutputDir(
			configPath,
			rawConfig.pages_build_output_dir
		),
		legacy_env: isLegacyEnv,
		send_metrics: rawConfig.send_metrics,
		keep_vars: rawConfig.keep_vars,
		...activeEnv,
		dev: normalizeAndValidateDev(diagnostics, rawConfig.dev ?? {}, args),
		site: normalizeAndValidateSite(
			diagnostics,
			configPath,
			rawConfig,
			activeEnv.main
		),
		legacy_assets: normalizeAndValidateLegacyAssets(
			diagnostics,
			configPath,
			rawConfig
		),
		alias: normalizeAndValidateAliases(diagnostics, configPath, rawConfig),
		wasm_modules: normalizeAndValidateModulePaths(
			diagnostics,
			configPath,
			"wasm_modules",
			rawConfig.wasm_modules
		),
		text_blobs: normalizeAndValidateModulePaths(
			diagnostics,
			configPath,
			"text_blobs",
			rawConfig.text_blobs
		),
		data_blobs: normalizeAndValidateModulePaths(
			diagnostics,
			configPath,
			"data_blobs",
			rawConfig.data_blobs
		),
	};

	validateBindingsHaveUniqueNames(diagnostics, config);

	validateAdditionalProperties(
		diagnostics,
		"top-level",
		Object.keys(rawConfig),
		[...Object.keys(config), "env", "$schema"]
	);

	return { config, diagnostics };
}

/**
 * Validate the `build` configuration and return the normalized values.
 */
function normalizeAndValidateBuild(
	diagnostics: Diagnostics,
	rawEnv: RawEnvironment,
	rawBuild: Config["build"],
	configPath: string | undefined
): Config["build"] & { deprecatedUpload: DeprecatedUpload } {
	const { command, cwd, watch_dir = "./src", upload, ...rest } = rawBuild;
	const deprecatedUpload: DeprecatedUpload = { ...upload };
	validateAdditionalProperties(diagnostics, "build", Object.keys(rest), []);

	validateOptionalProperty(diagnostics, "build", "command", command, "string");
	validateOptionalProperty(diagnostics, "build", "cwd", cwd, "string");
	if (Array.isArray(watch_dir)) {
		validateTypedArray(diagnostics, "build.watch_dir", watch_dir, "string");
	} else {
		validateOptionalProperty(
			diagnostics,
			"build",
			"watch_dir",
			watch_dir,
			"string"
		);
	}

	deprecated(
		diagnostics,
		rawEnv,
		"build.upload.format",
		"The format is inferred automatically from the code.",
		true
	);

	if (rawEnv.main !== undefined && rawBuild.upload?.main) {
		diagnostics.errors.push(
			`Don't define both the \`main\` and \`build.upload.main\` fields in your configuration.\n` +
				`They serve the same purpose: to point to the entry-point of your worker.\n` +
				`Delete the \`build.upload.main\` and \`build.upload.dir\` field from your config.`
		);
	} else {
		deprecated(
			diagnostics,
			rawEnv,
			"build.upload.main",
			`Delete the \`build.upload.main\` and \`build.upload.dir\` fields.\n` +
				`Then add the top level \`main\` field to your configuration file:\n` +
				`\`\`\`\n` +
				`main = "${path.join(
					rawBuild.upload?.dir ?? "./dist",
					rawBuild.upload?.main ?? "."
				)}"\n` +
				`\`\`\``,
			true
		);

		deprecated(
			diagnostics,
			rawEnv,
			"build.upload.dir",
			`Use the top level "main" field or a command-line argument to specify the entry-point for the Worker.`,
			true
		);
	}

	return {
		command,
		watch_dir:
			// - `watch_dir` only matters when `command` is defined, so we apply
			// a default only when `command` is defined
			// - `configPath` will always be defined since `build` can only
			// be configured in `wrangler.toml`, but who knows, that may
			// change in the future, so we do a check anyway
			command && configPath
				? Array.isArray(watch_dir)
					? watch_dir.map((dir) =>
							path.relative(
								process.cwd(),
								path.join(path.dirname(configPath), `${dir}`)
							)
						)
					: path.relative(
							process.cwd(),
							path.join(path.dirname(configPath), `${watch_dir}`)
						)
				: watch_dir,
		cwd,
		deprecatedUpload,
	};
}

/**
 * Validate the `main` field and return the normalized values.
 */
function normalizeAndValidateMainField(
	configPath: string | undefined,
	rawMain: string | undefined,
	deprecatedUpload: DeprecatedUpload | undefined
): string | undefined {
	const configDir = path.dirname(configPath ?? "wrangler.toml");
	if (rawMain !== undefined) {
		if (typeof rawMain === "string") {
			const directory = path.resolve(configDir);
			return path.resolve(directory, rawMain);
		} else {
			return rawMain;
		}
	} else if (deprecatedUpload?.main !== undefined) {
		const directory = path.resolve(
			configDir,
			deprecatedUpload?.dir || "./dist"
		);
		return path.resolve(directory, deprecatedUpload.main);
	} else {
		return;
	}
}

/**
 * Validate the `base_dir` field and return the normalized values.
 */
function normalizeAndValidateBaseDirField(
	configPath: string | undefined,
	rawDir: string | undefined
): string | undefined {
	const configDir = path.dirname(configPath ?? "wrangler.toml");
	if (rawDir !== undefined) {
		if (typeof rawDir === "string") {
			const directory = path.resolve(configDir);
			return path.resolve(directory, rawDir);
		} else {
			return rawDir;
		}
	} else {
		return;
	}
}

/**
 * Validate the `pages_build_output_dir` field and return the normalized values.
 */
function normalizeAndValidatePagesBuildOutputDir(
	configPath: string | undefined,
	rawPagesDir: string | undefined
): string | undefined {
	const configDir = path.dirname(configPath ?? "wrangler.toml");
	if (rawPagesDir !== undefined) {
		if (typeof rawPagesDir === "string") {
			const directory = path.resolve(configDir);
			return path.resolve(directory, rawPagesDir);
		} else {
			return rawPagesDir;
		}
	} else {
		return;
	}
}

/**
 * Validate the `dev` configuration and return the normalized values.
 */
function normalizeAndValidateDev(
	diagnostics: Diagnostics,
	rawDev: RawDevConfig,
	args: NormalizeAndValidateConfigArgs
): DevConfig {
	assert(typeof args === "object" && args !== null && !Array.isArray(args));
	const {
		localProtocol: localProtocolArg,
		upstreamProtocol: upstreamProtocolArg,
		remote: remoteArg,
	} = args;
	assert(
		localProtocolArg === undefined ||
			localProtocolArg === "http" ||
			localProtocolArg === "https"
	);
	assert(
		upstreamProtocolArg === undefined ||
			upstreamProtocolArg === "http" ||
			upstreamProtocolArg === "https"
	);
	assert(remoteArg === undefined || typeof remoteArg === "boolean");
	const {
		// On Windows, when specifying `localhost` as the socket hostname, `workerd`
		// will only listen on the IPv4 loopback `127.0.0.1`, not the IPv6 `::1`:
		// https://github.com/cloudflare/workerd/issues/1408
		// On Node 17+, `fetch()` will only try to fetch the IPv6 address.
		// For now, on Windows, we default to listening on IPv4 only and using
		// `127.0.0.1` when sending control requests to `workerd` (e.g. with the
		// `ProxyController`).
		ip = process.platform === "win32" ? "127.0.0.1" : "localhost",
		port,
		inspector_port,
		local_protocol = localProtocolArg ?? "http",
		// In remote mode upstream_protocol must be https, otherwise it defaults to local_protocol.
		upstream_protocol = upstreamProtocolArg ?? remoteArg
			? "https"
			: local_protocol,
		host,
		...rest
	} = rawDev;
	validateAdditionalProperties(diagnostics, "dev", Object.keys(rest), []);

	validateOptionalProperty(diagnostics, "dev", "ip", ip, "string");
	validateOptionalProperty(diagnostics, "dev", "port", port, "number");
	validateOptionalProperty(
		diagnostics,
		"dev",
		"inspector_port",
		inspector_port,
		"number"
	);
	validateOptionalProperty(
		diagnostics,
		"dev",
		"local_protocol",
		local_protocol,
		"string",
		["http", "https"]
	);
	validateOptionalProperty(
		diagnostics,
		"dev",
		"upstream_protocol",
		upstream_protocol,
		"string",
		["http", "https"]
	);
	validateOptionalProperty(diagnostics, "dev", "host", host, "string");
	return { ip, port, inspector_port, local_protocol, upstream_protocol, host };
}

/**
 * Validate the `site` configuration and return the normalized values.
 */
function normalizeAndValidateSite(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawConfig: RawConfig,
	mainEntryPoint: string | undefined
): Config["site"] {
	if (rawConfig?.site !== undefined) {
		const { bucket, include = [], exclude = [], ...rest } = rawConfig.site;

		validateAdditionalProperties(diagnostics, "site", Object.keys(rest), [
			"entry-point",
		]);
		validateRequiredProperty(diagnostics, "site", "bucket", bucket, "string");
		validateTypedArray(diagnostics, "sites.include", include, "string");
		validateTypedArray(diagnostics, "sites.exclude", exclude, "string");
		validateOptionalProperty(
			diagnostics,
			"site",
			"entry-point",
			rawConfig.site["entry-point"],
			"string"
		);

		deprecated(
			diagnostics,
			rawConfig,
			`site.entry-point`,
			`Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration file:\n` +
				`\`\`\`\n` +
				`main = "${path.join(
					String(rawConfig.site["entry-point"]) || "workers-site",
					path.extname(String(rawConfig.site["entry-point"]) || "workers-site")
						? ""
						: "index.js"
				)}"\n` +
				`\`\`\``,
			false,
			undefined,
			"warning"
		);

		let siteEntryPoint = rawConfig.site["entry-point"];

		if (!mainEntryPoint && !siteEntryPoint) {
			// this means that we're defaulting to "workers-site"
			// so let's add the deprecation warning
			diagnostics.warnings.push(
				`Because you've defined a [site] configuration, we're defaulting to "workers-site" for the deprecated \`site.entry-point\`field.\n` +
					`Add the top level \`main\` field to your configuration file:\n` +
					`\`\`\`\n` +
					`main = "workers-site/index.js"\n` +
					`\`\`\``
			);
			siteEntryPoint = "workers-site";
		} else if (mainEntryPoint && siteEntryPoint) {
			diagnostics.errors.push(
				`Don't define both the \`main\` and \`site.entry-point\` fields in your configuration.\n` +
					`They serve the same purpose: to point to the entry-point of your worker.\n` +
					`Delete the deprecated \`site.entry-point\` field from your config.`
			);
		}

		if (configPath && siteEntryPoint) {
			// rewrite the path to be relative to the working directory
			siteEntryPoint = path.relative(
				process.cwd(),
				path.join(path.dirname(configPath), siteEntryPoint)
			);
		}

		return {
			bucket,
			"entry-point": siteEntryPoint,
			include,
			exclude,
		};
	}
	return undefined;
}

/**
 * Validate the `alias` configuration
 */
function normalizeAndValidateAliases(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawConfig: RawConfig
): Config["alias"] {
	if (rawConfig?.alias === undefined) {
		return undefined;
	}
	if (
		["string", "boolean", "number"].includes(typeof rawConfig?.alias) ||
		typeof rawConfig?.alias !== "object"
	) {
		diagnostics.errors.push(
			`Expected alias to be an object, but got ${typeof rawConfig?.alias}`
		);
		return undefined;
	}

	let isValid = true;
	for (const [key, value] of Object.entries(rawConfig?.alias)) {
		if (typeof value !== "string") {
			diagnostics.errors.push(
				`Expected alias["${key}"] to be a string, but got ${typeof value}`
			);
			isValid = false;
		}
	}
	if (isValid) {
		return rawConfig.alias;
	}

	return;
}

/**
 * Validate the `legacy_assets` configuration and return normalized values.
 */
function normalizeAndValidateLegacyAssets(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawConfig: RawConfig
): Config["legacy_assets"] {
	const legacyAssetsConfig = rawConfig["legacy_assets"];

	// Even though the type doesn't say it,
	// we allow for a string input in the config,
	// so let's normalise it
	if (typeof legacyAssetsConfig === "string") {
		return {
			bucket: legacyAssetsConfig,
			include: [],
			exclude: [],
			browser_TTL: undefined,
			serve_single_page_app: false,
		};
	}

	if (legacyAssetsConfig === undefined) {
		return undefined;
	}

	if (typeof legacyAssetsConfig !== "object") {
		diagnostics.errors.push(
			`Expected the \`legacy_assets\` field to be a string or an object, but got ${typeof legacyAssetsConfig}.`
		);
		return undefined;
	}

	const {
		bucket,
		include = [],
		exclude = [],
		browser_TTL,
		serve_single_page_app,
		...rest
	} = legacyAssetsConfig;

	validateAdditionalProperties(
		diagnostics,
		"legacy_assets",
		Object.keys(rest),
		[]
	);

	validateRequiredProperty(
		diagnostics,
		"legacy_assets",
		"bucket",
		bucket,
		"string"
	);
	validateTypedArray(diagnostics, `legacy_assets.include`, include, "string");
	validateTypedArray(diagnostics, `legacy_assets.exclude`, exclude, "string");

	validateOptionalProperty(
		diagnostics,
		"legacy_assets",
		"browser_TTL",
		browser_TTL,
		"number"
	);

	validateOptionalProperty(
		diagnostics,
		"legacy_assets",
		"serve_single_page_app",
		serve_single_page_app,
		"boolean"
	);

	return {
		bucket,
		include,
		exclude,
		browser_TTL,
		serve_single_page_app,
	};
}

/**
 * Map the paths of the `wasm_modules`, `text_blobs` or `data_blobs` configuration to be relative to the current working directory.
 */
function normalizeAndValidateModulePaths(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	field: "wasm_modules" | "text_blobs" | "data_blobs",
	rawMapping: Record<string, string> | undefined
): Record<string, string> | undefined {
	if (rawMapping === undefined) {
		return undefined;
	}
	const mapping: Record<string, string> = {};
	// Rewrite paths to be relative to the cwd, rather than the config path.
	for (const [name, filePath] of Object.entries(rawMapping)) {
		if (isString(diagnostics, `${field}['${name}']`, filePath, undefined)) {
			if (configPath) {
				mapping[name] = configPath
					? path.relative(
							process.cwd(),
							path.join(path.dirname(configPath), filePath)
						)
					: filePath;
			}
		}
	}
	return mapping;
}

/**
 * Check whether a value has the shape of a route, which can be a string
 * or an object that looks like {pattern: string, zone_id: string }
 */
function isValidRouteValue(item: unknown): boolean {
	if (!item) {
		return false;
	}
	if (typeof item === "string") {
		return true;
	}
	if (typeof item === "object") {
		if (!hasProperty(item, "pattern") || typeof item.pattern !== "string") {
			return false;
		}

		const otherKeys = Object.keys(item).length - 1; // minus one to subtract "pattern"

		const hasZoneId =
			hasProperty(item, "zone_id") && typeof item.zone_id === "string";
		const hasZoneName =
			hasProperty(item, "zone_name") && typeof item.zone_name === "string";
		const hasCustomDomainFlag =
			hasProperty(item, "custom_domain") &&
			typeof item.custom_domain === "boolean";

		if (otherKeys === 2 && hasCustomDomainFlag && (hasZoneId || hasZoneName)) {
			return true;
		} else if (
			otherKeys === 1 &&
			(hasZoneId || hasZoneName || hasCustomDomainFlag)
		) {
			return true;
		}
	}
	return false;
}

/**
 * If account_id has been passed as an empty string, normalise it to undefined.
 * This is to workaround older Wrangler v1-era templates that have account_id = '',
 * which isn't a valid value anyway
 */
function mutateEmptyStringAccountIDValue(
	diagnostics: Diagnostics,
	rawEnv: RawEnvironment
) {
	if (rawEnv.account_id === "") {
		diagnostics.warnings.push(
			`The "account_id" field in your configuration is an empty string and will be ignored.\n` +
				`Please remove the "account_id" field from your configuration.`
		);
		rawEnv.account_id = undefined;
	}
	return rawEnv;
}

/**
 * Normalize empty string to `undefined` by mutating rawEnv.route value.
 * As part of backward compatibility with Wrangler v1 converting empty string to `undefined`
 */
function mutateEmptyStringRouteValue(
	diagnostics: Diagnostics,
	rawEnv: RawEnvironment
): RawEnvironment {
	if (rawEnv["route"] === "") {
		diagnostics.warnings.push(
			`The "route" field in your configuration is an empty string and will be ignored.\n` +
				`Please remove the "route" field from your configuration.`
		);
		rawEnv["route"] = undefined;
	}

	return rawEnv;
}

/**
 * Validate that the field is a route.
 */
const isRoute: ValidatorFn = (diagnostics, field, value) => {
	if (value !== undefined && !isValidRouteValue(value)) {
		diagnostics.errors.push(
			`Expected "${field}" to be either a string, or an object with shape { pattern, custom_domain, zone_id | zone_name }, but got ${JSON.stringify(
				value
			)}.`
		);
		return false;
	}
	return true;
};

/**
 * Validate that the field is an array of routes.
 */
const isRouteArray: ValidatorFn = (diagnostics, field, value) => {
	if (value === undefined) {
		return true;
	}
	if (!Array.isArray(value)) {
		diagnostics.errors.push(
			`Expected "${field}" to be an array but got ${JSON.stringify(value)}.`
		);
		return false;
	}
	const invalidRoutes = [];
	for (const item of value) {
		if (!isValidRouteValue(item)) {
			invalidRoutes.push(item);
		}
	}
	if (invalidRoutes.length > 0) {
		diagnostics.errors.push(
			`Expected "${field}" to be an array of either strings or objects with the shape { pattern, custom_domain, zone_id | zone_name }, but these weren't valid: ${JSON.stringify(
				invalidRoutes,
				null,
				2
			)}.`
		);
	}
	return invalidRoutes.length === 0;
};

function normalizeAndValidateRoute(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment
): Config["route"] {
	return inheritable(
		diagnostics,
		topLevelEnv,
		mutateEmptyStringRouteValue(diagnostics, rawEnv),
		"route",
		isRoute,
		undefined
	);
}

function validateRoutes(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment
): Config["routes"] {
	return inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"routes",
		all(isRouteArray, isMutuallyExclusiveWith(rawEnv, "route")),
		undefined
	);
}

function normalizeAndValidatePlacement(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment
): Config["placement"] {
	if (rawEnv.placement) {
		validateRequiredProperty(
			diagnostics,
			"placement",
			"mode",
			rawEnv.placement.mode,
			"string",
			["off", "smart"]
		);
		validateOptionalProperty(
			diagnostics,
			"placement",
			"hint",
			rawEnv.placement.hint,
			"string"
		);
		if (rawEnv.placement.hint && rawEnv.placement.mode !== "smart") {
			diagnostics.errors.push(
				`"placement.hint" cannot be set if "placement.mode" is not "smart"`
			);
		}
	}

	return inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"placement",
		() => true,
		undefined
	);
}

function validateTailConsumer(
	diagnostics: Diagnostics,
	field: string,
	value: TailConsumer
) {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" should be an object but got ${JSON.stringify(value)}.`
		);
		return false;
	}

	let isValid = true;

	isValid =
		isValid &&
		validateRequiredProperty(
			diagnostics,
			field,
			"service",
			value.service,
			"string"
		);
	isValid =
		isValid &&
		validateOptionalProperty(
			diagnostics,
			field,
			"environment",
			value.environment,
			"string"
		);

	return isValid;
}

const validateTailConsumers: ValidatorFn = (diagnostics, field, value) => {
	if (!value) {
		return true;
	}
	if (!Array.isArray(value)) {
		diagnostics.errors.push(
			`Expected "${field}" to be an array but got ${JSON.stringify(value)}.`
		);
		return false;
	}

	let isValid = true;
	for (let i = 0; i < value.length; i++) {
		isValid =
			validateTailConsumer(diagnostics, `${field}[${i}]`, value[i]) && isValid;
	}

	return isValid;
};

/**
 * Validate top-level environment configuration and return the normalized values.
 */
function normalizeAndValidateEnvironment(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	topLevelEnv: RawEnvironment,
	isDispatchNamespace: boolean
): Environment;
/**
 * Validate the named environment configuration and return the normalized values.
 */
function normalizeAndValidateEnvironment(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawEnv: RawEnvironment,
	isDispatchNamespace: boolean,
	envName: string,
	topLevelEnv: Environment,
	isLegacyEnv: boolean,
	rawConfig: RawConfig
): Environment;
/**
 * Validate the named environment configuration and return the normalized values.
 */
function normalizeAndValidateEnvironment(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawEnv: RawEnvironment,
	isDispatchNamespace: boolean,
	envName?: string,
	topLevelEnv?: Environment,
	isLegacyEnv?: boolean,
	rawConfig?: RawConfig
): Environment;
function normalizeAndValidateEnvironment(
	diagnostics: Diagnostics,
	configPath: string | undefined,
	rawEnv: RawEnvironment,
	isDispatchNamespace: boolean,
	envName = "top level",
	topLevelEnv?: Environment | undefined,
	isLegacyEnv?: boolean,
	rawConfig?: RawConfig | undefined
): Environment {
	deprecated(
		diagnostics,
		rawEnv,
		"kv-namespaces",
		`The "kv-namespaces" field is no longer supported, please rename to "kv_namespaces"`,
		true
	);
	deprecated(
		diagnostics,
		rawEnv,
		"zone_id",
		"This is unnecessary since we can deduce this from routes directly.",
		false // We need to leave this in-place for the moment since `route` commands might use it.
	);

	// The field "experimental_services" doesn't exist anymore in the config, but we still want to error about any older usage.

	deprecated(
		diagnostics,
		rawEnv,
		"experimental_services",
		`The "experimental_services" field is no longer supported. Simply rename the [experimental_services] field to [services].`,
		true
	);

	experimental(diagnostics, rawEnv, "unsafe");

	const route = normalizeAndValidateRoute(diagnostics, topLevelEnv, rawEnv);

	const account_id = inheritableInLegacyEnvironments(
		diagnostics,
		isLegacyEnv,
		topLevelEnv,
		mutateEmptyStringAccountIDValue(diagnostics, rawEnv),
		"account_id",
		isString,
		undefined,
		undefined
	);

	const routes = validateRoutes(diagnostics, topLevelEnv, rawEnv);

	const workers_dev = inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"workers_dev",
		isBoolean,
		undefined
	);

	const { deprecatedUpload, ...build } = normalizeAndValidateBuild(
		diagnostics,
		rawEnv,
		rawEnv.build ?? topLevelEnv?.build ?? {},
		configPath
	);

	const environment: Environment = {
		// Inherited fields
		account_id,
		compatibility_date: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"compatibility_date",
			isString,
			undefined
		),
		compatibility_flags: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"compatibility_flags",
			isStringArray,
			[]
		),
		jsx_factory: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"jsx_factory",
			isString,
			"React.createElement"
		),
		jsx_fragment: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"jsx_fragment",
			isString,
			"React.Fragment"
		),
		tsconfig: validateAndNormalizeTsconfig(
			diagnostics,
			topLevelEnv,
			rawEnv,
			configPath
		),
		rules: validateAndNormalizeRules(
			diagnostics,
			topLevelEnv,
			rawEnv,
			deprecatedUpload?.rules,
			envName
		),
		name: inheritableInLegacyEnvironments(
			diagnostics,
			isLegacyEnv,
			topLevelEnv,
			rawEnv,
			"name",
			isDispatchNamespace ? isString : isValidName,
			appendEnvName(envName),
			undefined
		),
		main: normalizeAndValidateMainField(
			configPath,
			inheritable(
				diagnostics,
				topLevelEnv,
				rawEnv,
				"main",
				isString,
				undefined
			),
			deprecatedUpload
		),
		find_additional_modules: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"find_additional_modules",
			isBoolean,
			undefined
		),
		preserve_file_names: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"preserve_file_names",
			isBoolean,
			undefined
		),
		base_dir: normalizeAndValidateBaseDirField(
			configPath,
			inheritable(
				diagnostics,
				topLevelEnv,
				rawEnv,
				"base_dir",
				isString,
				undefined
			)
		),
		route,
		routes,
		triggers: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"triggers",
			isObjectWith("crons"),
			{ crons: [] }
		),
		assets: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"assets",
			validateAssetsConfig,
			undefined
		),
		usage_model: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"usage_model",
			isOneOf("bundled", "unbound"),
			undefined
		),
		limits: normalizeAndValidateLimits(diagnostics, topLevelEnv, rawEnv),
		placement: normalizeAndValidatePlacement(diagnostics, topLevelEnv, rawEnv),
		build,
		workers_dev,
		// Not inherited fields
		vars: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"vars",
			validateVars(envName),
			{}
		),
		define: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"define",
			validateDefines(envName),
			{}
		),
		durable_objects: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"durable_objects",
			validateBindingsProperty(envName, validateDurableObjectBinding),
			{
				bindings: [],
			}
		),
		migrations: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"migrations",
			validateMigrations,
			[]
		),
		kv_namespaces: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"kv_namespaces",
			validateBindingArray(envName, validateKVBinding),
			[]
		),
		cloudchamber: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"cloudchamber",
			validateCloudchamberConfig,
			{}
		),
		send_email: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"send_email",
			validateBindingArray(envName, validateSendEmailBinding),
			[]
		),
		queues: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"queues",
			validateQueues(envName),
			{ producers: [], consumers: [] }
		),
		r2_buckets: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"r2_buckets",
			validateBindingArray(envName, validateR2Binding),
			[]
		),
		d1_databases: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"d1_databases",
			validateBindingArray(envName, validateD1Binding),
			[]
		),
		vectorize: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"vectorize",
			validateBindingArray(envName, validateVectorizeBinding),
			[]
		),
		hyperdrive: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"hyperdrive",
			validateBindingArray(envName, validateHyperdriveBinding),
			[]
		),
		services: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"services",
			validateBindingArray(envName, validateServiceBinding),
			[]
		),
		analytics_engine_datasets: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"analytics_engine_datasets",
			validateBindingArray(envName, validateAnalyticsEngineBinding),
			[]
		),
		dispatch_namespaces: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"dispatch_namespaces",
			validateBindingArray(envName, validateWorkerNamespaceBinding),
			[]
		),
		mtls_certificates: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"mtls_certificates",
			validateBindingArray(envName, validateMTlsCertificateBinding),
			[]
		),
		tail_consumers: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"tail_consumers",
			validateTailConsumers,
			undefined
		),
		unsafe: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"unsafe",
			validateUnsafeSettings(envName),
			{}
		),
		browser: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"browser",
			validateBrowserBinding(envName),
			undefined
		),
		ai: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"ai",
			validateAIBinding(envName),
			undefined
		),
		pipelines: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"pipelines",
			validateBindingArray(envName, validatePipelineBinding),
			[]
		),
		version_metadata: notInheritable(
			diagnostics,
			topLevelEnv,
			rawConfig,
			rawEnv,
			envName,
			"version_metadata",
			validateVersionMetadataBinding(envName),
			undefined
		),
		zone_id: rawEnv.zone_id,
		logfwdr: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"logfwdr",
			validateCflogfwdrObject(envName),
			{
				bindings: [],
			}
		),
		no_bundle: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"no_bundle",
			isBoolean,
			undefined
		),
		minify: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"minify",
			isBoolean,
			undefined
		),
		node_compat: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"node_compat",
			isBoolean,
			undefined
		),
		first_party_worker: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"first_party_worker",
			isBoolean,
			undefined
		),
		logpush: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"logpush",
			isBoolean,
			undefined
		),
		upload_source_maps: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"upload_source_maps",
			isBoolean,
			undefined
		),
		observability: inheritable(
			diagnostics,
			topLevelEnv,
			rawEnv,
			"observability",
			validateObservability,
			undefined
		),
	};

	warnIfDurableObjectsHaveNoMigrations(
		diagnostics,
		environment.durable_objects,
		environment.migrations
	);

	return environment;
}

function validateAndNormalizeTsconfig(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment,
	configPath: string | undefined
) {
	const tsconfig = inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"tsconfig",
		isString,
		undefined
	);

	return configPath && tsconfig
		? path.relative(
				process.cwd(),
				path.join(path.dirname(configPath), tsconfig)
			)
		: tsconfig;
}

const validateAndNormalizeRules = (
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment,
	deprecatedRules: Rule[] | undefined,
	envName: string
): Rule[] => {
	if (topLevelEnv === undefined) {
		// Only create errors/warnings for the top-level environment
		if (rawEnv.rules && deprecatedRules) {
			diagnostics.errors.push(
				`You cannot configure both [rules] and [build.upload.rules] in your wrangler.toml. Delete the \`build.upload\` section.`
			);
		} else if (deprecatedRules) {
			diagnostics.warnings.push(
				`Deprecation: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:\n` +
					"```\n" +
					TOML.stringify({ rules: deprecatedRules }) +
					"```"
			);
		}
	}

	return inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"rules",
		validateRules(envName),
		deprecatedRules ?? []
	);
};

const validateRules =
	(envName: string): ValidatorFn =>
	(diagnostics, field, envValue, config) => {
		if (!envValue) {
			return true;
		}
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;
		if (!Array.isArray(envValue)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an array but got ${JSON.stringify(
					envValue
				)}.`
			);
			return false;
		}

		let isValid = true;
		for (let i = 0; i < envValue.length; i++) {
			isValid =
				validateRule(diagnostics, `${fieldPath}[${i}]`, envValue[i], config) &&
				isValid;
		}
		return isValid;
	};

const validateRule: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" should be an object but got ${JSON.stringify(value)}.`
		);
		return false;
	}
	// Rules must have a type string and glob string array, and optionally a fallthrough boolean.
	let isValid = true;
	const rule = value as Rule;

	if (
		!isRequiredProperty(rule, "type", "string", [
			"ESModule",
			"CommonJS",
			"CompiledWasm",
			"Text",
			"Data",
		])
	) {
		diagnostics.errors.push(
			`bindings should have a string "type" field, which contains one of "ESModule", "CommonJS", "CompiledWasm", "Text", or "Data".`
		);
		isValid = false;
	}

	isValid =
		validateTypedArray(diagnostics, `${field}.globs`, rule.globs, "string") &&
		isValid;

	if (!isOptionalProperty(rule, "fallthrough", "boolean")) {
		diagnostics.errors.push(
			`the field "fallthrough", when present, should be a boolean.`
		);
		isValid = false;
	}

	return isValid;
};

const validateDefines =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		let isValid = true;
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value === "object" && value !== null) {
			for (const varName in value) {
				// some casting here to appease typescript
				// even though the value might not match the type
				if (typeof (value as Record<string, string>)[varName] !== "string") {
					diagnostics.errors.push(
						`The field "${fieldPath}.${varName}" should be a string but got ${JSON.stringify(
							(value as Record<string, string>)[varName]
						)}.`
					);
					isValid = false;
				}
			}
		} else {
			if (value !== undefined) {
				diagnostics.errors.push(
					`The field "${fieldPath}" should be an object but got ${JSON.stringify(
						value
					)}.\n`
				);
				isValid = false;
			}
		}

		const configDefines = Object.keys(config?.define ?? {});

		// If there are no top level vars then there is nothing to do here.
		if (configDefines.length > 0) {
			if (typeof value === "object" && value !== null) {
				const configEnvDefines = config === undefined ? [] : Object.keys(value);

				for (const varName of configDefines) {
					if (!(varName in value)) {
						diagnostics.warnings.push(
							`"define.${varName}" exists at the top level, but not on "${fieldPath}".\n` +
								`This is not what you probably want, since "define" configuration is not inherited by environments.\n` +
								`Please add "define.${varName}" to "env.${envName}".`
						);
					}
				}
				for (const varName of configEnvDefines) {
					if (!configDefines.includes(varName)) {
						diagnostics.warnings.push(
							`"${varName}" exists on "env.${envName}", but not on the top level.\n` +
								`This is not what you probably want, since "define" configuration within environments can only override existing top level "define" configuration\n` +
								`Please remove "${fieldPath}.${varName}", or add "define.${varName}".`
						);
					}
				}
			}
		}

		return isValid;
	};

const validateVars =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		let isValid = true;
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;
		const configVars = Object.keys(config?.vars ?? {});
		// If there are no top level vars then there is nothing to do here.
		if (configVars.length > 0) {
			if (typeof value !== "object" || value === null) {
				diagnostics.errors.push(
					`The field "${fieldPath}" should be an object but got ${JSON.stringify(
						value
					)}.\n`
				);
				isValid = false;
			} else {
				for (const varName of configVars) {
					if (!(varName in value)) {
						diagnostics.warnings.push(
							`"vars.${varName}" exists at the top level, but not on "${fieldPath}".\n` +
								`This is not what you probably want, since "vars" configuration is not inherited by environments.\n` +
								`Please add "vars.${varName}" to "env.${envName}".`
						);
					}
				}
			}
		}
		return isValid;
	};

const validateBindingsProperty =
	(envName: string, validateBinding: ValidatorFn): ValidatorFn =>
	(diagnostics, field, value, config) => {
		let isValid = true;
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (value !== undefined) {
			// Check the validity of the `value` as a bindings container.
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				diagnostics.errors.push(
					`The field "${fieldPath}" should be an object but got ${JSON.stringify(
						value
					)}.`
				);
				isValid = false;
			} else if (!hasProperty(value, "bindings")) {
				diagnostics.errors.push(
					`The field "${fieldPath}" is missing the required "bindings" property.`
				);
				isValid = false;
			} else if (!Array.isArray(value.bindings)) {
				diagnostics.errors.push(
					`The field "${fieldPath}.bindings" should be an array but got ${JSON.stringify(
						value.bindings
					)}.`
				);
				isValid = false;
			} else {
				for (let i = 0; i < value.bindings.length; i++) {
					const binding = value.bindings[i];
					const bindingDiagnostics = new Diagnostics(
						`"${fieldPath}.bindings[${i}]": ${JSON.stringify(binding)}`
					);
					isValid =
						validateBinding(
							bindingDiagnostics,
							`${fieldPath}.bindings[${i}]`,
							binding,
							config
						) && isValid;
					diagnostics.addChild(bindingDiagnostics);
				}
			}

			const configBindingNames = getBindingNames(
				config?.[field as keyof Environment]
			);
			if (isValid && configBindingNames.length > 0) {
				// If there are top level bindings then check that they all appear in the environment.
				const envBindingNames = new Set(getBindingNames(value));
				const missingBindings = configBindingNames.filter(
					(name) => !envBindingNames.has(name)
				);
				if (missingBindings.length > 0) {
					diagnostics.warnings.push(
						`The following bindings are at the top level, but not on "env.${envName}".\n` +
							`This is not what you probably want, since "${field}" configuration is not inherited by environments.\n` +
							`Please add a binding for each to "${fieldPath}.bindings":\n` +
							missingBindings.map((name) => `- ${name}`).join("\n")
					);
				}
			}
		}
		return isValid;
	};

const validateUnsafeSettings =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an object but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		// At least one of bindings and metadata must exist
		if (
			!hasProperty(value, "bindings") &&
			!hasProperty(value, "metadata") &&
			!hasProperty(value, "capnp")
		) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should contain at least one of "bindings", "metadata" or "capnp" properties but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		// unsafe.bindings
		if (hasProperty(value, "bindings") && value.bindings !== undefined) {
			const validateBindingsFn = validateBindingsProperty(
				envName,
				validateUnsafeBinding
			);
			const valid = validateBindingsFn(diagnostics, field, value, config);
			if (!valid) {
				return false;
			}
		}

		// unsafe.metadata
		if (
			hasProperty(value, "metadata") &&
			value.metadata !== undefined &&
			(typeof value.metadata !== "object" ||
				value.metadata === null ||
				Array.isArray(value.metadata))
		) {
			diagnostics.errors.push(
				`The field "${fieldPath}.metadata" should be an object but got ${JSON.stringify(
					value.metadata
				)}.`
			);
			return false;
		}

		// unsafe.capnp
		if (hasProperty(value, "capnp") && value.capnp !== undefined) {
			if (
				typeof value.capnp !== "object" ||
				value.capnp === null ||
				Array.isArray(value.capnp)
			) {
				diagnostics.errors.push(
					`The field "${fieldPath}.capnp" should be an object but got ${JSON.stringify(
						value.capnp
					)}.`
				);
				return false;
			}

			// validate whether they have a compiled_schema string. If they do, they should not use base_path or source_schemas
			if (hasProperty(value.capnp, "compiled_schema")) {
				if (
					hasProperty(value.capnp, "base_path") ||
					hasProperty(value.capnp, "source_schemas")
				) {
					diagnostics.errors.push(
						`The field "${fieldPath}.capnp" cannot contain both "compiled_schema" and one of "base_path" or "source_schemas".`
					);
					return false;
				}

				if (typeof value.capnp.compiled_schema !== "string") {
					diagnostics.errors.push(
						`The field "${fieldPath}.capnp.compiled_schema", when present, should be a string but got ${JSON.stringify(
							value.capnp.compiled_schema
						)}.`
					);
					return false;
				}
			} else {
				// they don't have a compiled_schema property, so they must have both base_path and source_schemas
				if (!isRequiredProperty(value.capnp, "base_path", "string")) {
					diagnostics.errors.push(
						`The field "${fieldPath}.capnp.base_path", when present, should be a string but got ${JSON.stringify(
							value.capnp.base_path
						)}`
					);
				}

				if (
					!validateTypedArray(
						diagnostics,
						`${fieldPath}.capnp.source_schemas`,
						value.capnp.source_schemas,
						"string"
					)
				) {
					return false;
				}
			}
		}

		return true;
	};

/**
 * Check that the given field is a valid "durable_object" binding object.
 */
const validateDurableObjectBinding: ValidatorFn = (
	diagnostics,
	field,
	value
) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`Expected "${field}" to be an object but got ${JSON.stringify(value)}`
		);
		return false;
	}

	// Durable Object bindings must have a name and class_name, and optionally a script_name and an environment.
	let isValid = true;
	if (!isRequiredProperty(value, "name", "string")) {
		diagnostics.errors.push(`binding should have a string "name" field.`);
		isValid = false;
	}
	if (!isRequiredProperty(value, "class_name", "string")) {
		diagnostics.errors.push(`binding should have a string "class_name" field.`);
		isValid = false;
	}
	if (!isOptionalProperty(value, "script_name", "string")) {
		diagnostics.errors.push(
			`the field "script_name", when present, should be a string.`
		);
		isValid = false;
	}
	// environment requires a script_name
	if (!isOptionalProperty(value, "environment", "string")) {
		diagnostics.errors.push(
			`the field "environment", when present, should be a string.`
		);
		isValid = false;
	}

	if ("environment" in value && !("script_name" in value)) {
		diagnostics.errors.push(
			`binding should have a "script_name" field if "environment" is present.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"class_name",
		"environment",
		"name",
		"script_name",
	]);

	return isValid;
};

const validateCflogfwdrObject: (env: string) => ValidatorFn =
	(envName) => (diagnostics, field, value, topLevelEnv) => {
		//validate the bindings property first, as this also validates that it's an object, etc.
		const bindingsValidation = validateBindingsProperty(
			envName,
			validateCflogfwdrBinding
		);
		if (!bindingsValidation(diagnostics, field, value, topLevelEnv)) {
			return false;
		}

		const v = value as {
			bindings: [];
			schema: string | undefined;
		};

		if (v?.schema !== undefined) {
			// the user should not be using the old schema property, as we've migrated to unsafe.capnp.schema for consistency with the unsafe bindings
			diagnostics.errors.push(
				`"${field}" binding "schema" property has been replaced with the "unsafe.capnp" object, which expects a "base_path" and an array of "source_schemas" to compile, or a "compiled_schema" property.`
			);
			return false;
		}

		return true;
	};

const validateCflogfwdrBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`Expected "${field}" to be an object but got ${JSON.stringify(value)}`
		);
		return false;
	}

	let isValid = true;
	if (!isRequiredProperty(value, "name", "string")) {
		diagnostics.errors.push(`binding should have a string "name" field.`);
		isValid = false;
	}

	if (!isRequiredProperty(value, "destination", "string")) {
		diagnostics.errors.push(
			`binding should have a string "destination" field.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"destination",
		"name",
	]);

	return isValid;
};

const validateAssetsConfig: ValidatorFn = (diagnostics, field, value) => {
	if (value === undefined) {
		return true;
	}

	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" should be an object, but got value ${JSON.stringify(
				field
			)} of type ${typeof value}`
		);
		return false;
	}

	let isValid = true;

	// ensure we validate all props before we show the validation errors
	// this way users have all the necessary info to fix all errors in one go
	isValid =
		validateRequiredProperty(
			diagnostics,
			field,
			"directory",
			(value as Assets).directory,
			"string"
		) && isValid;

	isValid =
		isNonEmptyString(
			diagnostics,
			`${field}.directory`,
			(value as Assets).directory,
			undefined
		) && isValid;

	isValid =
		validateOptionalProperty(
			diagnostics,
			field,
			"binding",
			(value as Assets).binding,
			"string"
		) && isValid;

	isValid =
		validateOptionalProperty(
			diagnostics,
			field,
			"html_handling",
			(value as Assets).html_handling,
			"string",
			[
				"auto-trailing-slash",
				"force-trailing-slash",
				"drop-trailing-slash",
				"none",
			]
		) && isValid;

	isValid =
		validateOptionalProperty(
			diagnostics,
			field,
			"not_found_handling",
			(value as Assets).not_found_handling,
			"string",
			["single-page-application", "404-page", "none"]
		) && isValid;

	isValid =
		validateAdditionalProperties(diagnostics, field, Object.keys(value), [
			"directory",
			"binding",
			"html_handling",
			"not_found_handling",
		]) && isValid;

	return isValid;
};

const validateBrowserBinding =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an object but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		let isValid = true;
		if (!isRequiredProperty(value, "binding", "string")) {
			diagnostics.errors.push(`binding should have a string "binding" field.`);
			isValid = false;
		}

		validateAdditionalProperties(diagnostics, field, Object.keys(value), [
			"binding",
		]);

		return isValid;
	};

const validateAIBinding =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an object but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		let isValid = true;
		if (!isRequiredProperty(value, "binding", "string")) {
			diagnostics.errors.push(`binding should have a string "binding" field.`);
			isValid = false;
		}

		return isValid;
	};

const validateVersionMetadataBinding =
	(envName: string): ValidatorFn =>
	(diagnostics, field, value, config) => {
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an object but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		let isValid = true;
		if (!isRequiredProperty(value, "binding", "string")) {
			diagnostics.errors.push(`binding should have a string "binding" field.`);
			isValid = false;
		}

		return isValid;
	};

/**
 * Check that the given field is a valid "unsafe" binding object.
 *
 * TODO: further validation of known unsafe bindings.
 */
const validateUnsafeBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`Expected ${field} to be an object but got ${JSON.stringify(value)}.`
		);
		return false;
	}

	let isValid = true;
	// Unsafe bindings must have a name and type.
	if (!isRequiredProperty(value, "name", "string")) {
		diagnostics.errors.push(`binding should have a string "name" field.`);
		isValid = false;
	}
	if (isRequiredProperty(value, "type", "string")) {
		const safeBindings = [
			"plain_text",
			"secret_text",
			"json",
			"wasm_module",
			"data_blob",
			"text_blob",
			"browser",
			"ai",
			"kv_namespace",
			"durable_object_namespace",
			"d1_database",
			"r2_bucket",
			"service",
			"logfwdr",
			"mtls_certificate",
			"pipeline",
		];

		if (safeBindings.includes(value.type)) {
			diagnostics.warnings.push(
				`The binding type "${value.type}" is directly supported by wrangler.\n` +
					`Consider migrating this unsafe binding to a format for '${value.type}' bindings that is supported by wrangler for optimal support.\n` +
					"For more details, see https://developers.cloudflare.com/workers/cli-wrangler/configuration"
			);
		}

		if (
			value.type === "metadata" &&
			isRequiredProperty(value, "name", "string")
		) {
			diagnostics.warnings.push(
				"The deployment object in the metadata binding is now deprecated. " +
					"Please switch using the version_metadata binding for access to version specific fields: " +
					"https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata"
			);
		}
	} else {
		diagnostics.errors.push(`binding should have a string "type" field.`);
		isValid = false;
	}
	return isValid;
};

/**
 * Check that the given environment field is a valid array of bindings.
 */
const validateBindingArray =
	(envName: string, validateBinding: ValidatorFn): ValidatorFn =>
	(diagnostics, field, envValue, config) => {
		if (envValue === undefined) {
			return true;
		}

		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;
		if (!Array.isArray(envValue)) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an array but got ${JSON.stringify(
					envValue
				)}.`
			);
			return false;
		}

		let isValid = true;
		for (let i = 0; i < envValue.length; i++) {
			isValid =
				validateBinding(
					diagnostics,
					`${fieldPath}[${i}]`,
					envValue[i],
					config
				) && isValid;
		}
		const configValue = config?.[field as keyof Environment] as {
			binding: unknown;
		}[];
		if (Array.isArray(configValue)) {
			const configBindingNames = configValue.map((value) => value.binding);
			// If there are no top level bindings then there is nothing to do here.
			if (configBindingNames.length > 0) {
				const envBindingNames = new Set(envValue.map((value) => value.binding));
				for (const configBindingName of configBindingNames) {
					if (!envBindingNames.has(configBindingName)) {
						diagnostics.warnings.push(
							`There is a ${field} binding with name "${configBindingName}" at the top level, but not on "env.${envName}".\n` +
								`This is not what you probably want, since "${field}" configuration is not inherited by environments.\n` +
								`Please add a binding for "${configBindingName}" to "env.${envName}.${field}.bindings".`
						);
					}
				}
			}
		}
		return isValid;
	};

const validateCloudchamberConfig: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		diagnostics.errors.push(
			`"cloudchamber" should be an object, but got ${JSON.stringify(value)}`
		);
		return false;
	}

	const optionalAttrsByType = {
		string: ["memory", "image", "location"],
		boolean: ["ipv4"],
		number: ["vcpu"],
	};

	let isValid = true;
	Object.entries(optionalAttrsByType).forEach(([attrType, attrNames]) => {
		attrNames.forEach((key) => {
			if (!isOptionalProperty(value, key, attrType as TypeofType)) {
				diagnostics.errors.push(
					`"${field}" bindings should, optionally, have a ${attrType} "${key}" field but got ${JSON.stringify(
						value
					)}.`
				);
				isValid = false;
			}
		});
	});

	return isValid;
};

const validateKVBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"kv_namespaces" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	// KV bindings must have a binding and id.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		!isRequiredProperty(value, "id", "string") ||
		(value as { id: string }).id.length === 0
	) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "preview_id", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "preview_id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"id",
		"preview_id",
	]);

	return isValid;
};

const validateSendEmailBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"send_email" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	// send email bindings must have a name.
	if (!isRequiredProperty(value, "name", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "name" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "destination_address", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "destination_address" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "allowed_destination_addresses", "object")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a []string "allowed_destination_addresses" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		"destination_address" in value &&
		"allowed_destination_addresses" in value
	) {
		diagnostics.errors.push(
			`"${field}" bindings should have either a "destination_address" or "allowed_destination_addresses" field, but not both.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"allowed_destination_addresses",
		"destination_address",
		"name",
		"binding",
	]);

	return isValid;
};

const validateQueueBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"queue" bindings should be objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}

	if (
		!validateAdditionalProperties(diagnostics, field, Object.keys(value), [
			"binding",
			"queue",
			"delivery_delay",
		])
	) {
		return false;
	}

	// Queue bindings must have a binding and queue.
	let isValid = true;
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	if (
		!isRequiredProperty(value, "queue", "string") ||
		(value as { queue: string }).queue.length === 0
	) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "queue" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	const options: {
		key: string;
		type: "number" | "string" | "boolean";
	}[] = [{ key: "delivery_delay", type: "number" }];
	for (const optionalOpt of options) {
		if (!isOptionalProperty(value, optionalOpt.key, optionalOpt.type)) {
			diagnostics.errors.push(
				`"${field}" should, optionally, have a ${optionalOpt.type} "${
					optionalOpt.key
				}" field but got ${JSON.stringify(value)}.`
			);
			isValid = false;
		}
	}

	return isValid;
};

const validateR2Binding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"r2_buckets" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	// R2 bindings must have a binding and bucket_name.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		!isRequiredProperty(value, "bucket_name", "string") ||
		(value as { bucket_name: string }).bucket_name.length === 0
	) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "bucket_name" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "preview_bucket_name", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "preview_bucket_name" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "jurisdiction", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "jurisdiction" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"bucket_name",
		"preview_bucket_name",
		"jurisdiction",
	]);

	return isValid;
};

const validateD1Binding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"d1_databases" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;

	// D1 databases must have a binding and either a database_name or database_id.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		// TODO: allow name only, where we look up the ID dynamically
		// !isOptionalProperty(value, "database_name", "string") &&
		!isRequiredProperty(value, "database_id", "string")
	) {
		diagnostics.errors.push(
			`"${field}" bindings must have a "database_id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "preview_database_id", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "preview_database_id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"database_id",
		"database_internal_env",
		"database_name",
		"migrations_dir",
		"migrations_table",
		"preview_database_id",
	]);

	return isValid;
};

const validateVectorizeBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"vectorize" bindings should be objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}
	let isValid = true;
	// Vectorize bindings must have a binding and a project.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isRequiredProperty(value, "index_name", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings must have an "index_name" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"index_name",
	]);

	return isValid;
};

const validateHyperdriveBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"hyperdrive" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	// Hyperdrive bindings must have a binding and a project.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isRequiredProperty(value, "id", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings must have a "id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"id",
		"localConnectionString",
	]);

	return isValid;
};

/**
 * Check that bindings whose names might conflict, don't.
 *
 * We don't want to have, for example, a KV namespace named "DATA"
 * and a Durable Object also named "DATA". Then it would be ambiguous
 * what exactly would live at `env.DATA` (or in the case of service-workers,
 * the `DATA` global).
 */
const validateBindingsHaveUniqueNames = (
	diagnostics: Diagnostics,
	{
		durable_objects,
		kv_namespaces,
		r2_buckets,
		analytics_engine_datasets,
		text_blobs,
		browser,
		ai,
		unsafe,
		vars,
		define,
		wasm_modules,
		data_blobs,
	}: Partial<Config>
): boolean => {
	let hasDuplicates = false;

	const bindingsGroupedByType = {
		"Durable Object": getBindingNames(durable_objects),
		"KV Namespace": getBindingNames(kv_namespaces),
		"R2 Bucket": getBindingNames(r2_buckets),
		"Analytics Engine Dataset": getBindingNames(analytics_engine_datasets),
		"Text Blob": getBindingNames(text_blobs),
		Browser: getBindingNames(browser),
		AI: getBindingNames(ai),
		Unsafe: getBindingNames(unsafe),
		"Environment Variable": getBindingNames(vars),
		Definition: getBindingNames(define),
		"WASM Module": getBindingNames(wasm_modules),
		"Data Blob": getBindingNames(data_blobs),
	} as Record<string, string[]>;

	const bindingsGroupedByName: Record<string, string[]> = {};

	for (const bindingType in bindingsGroupedByType) {
		const bindingNames = bindingsGroupedByType[bindingType];

		for (const bindingName of bindingNames) {
			if (!(bindingName in bindingsGroupedByName)) {
				bindingsGroupedByName[bindingName] = [];
			}

			bindingsGroupedByName[bindingName].push(bindingType);
		}
	}

	for (const bindingName in bindingsGroupedByName) {
		const bindingTypes = bindingsGroupedByName[bindingName];
		if (bindingTypes.length < 2) {
			// there's only one (or zero) binding(s) with this name, which is fine, actually
			continue;
		}

		hasDuplicates = true;

		// there's two types of duplicates we want to look for:
		// - bindings with the same name of the same type (e.g. two Durable Objects both named "OBJ")
		// - bindings with the same name of different types (a KV namespace and DO both named "DATA")

		const sameType = bindingTypes
			// filter once to find duplicate binding types
			.filter((type, i) => bindingTypes.indexOf(type) !== i)
			// filter twice to only get _unique_ duplicate binding types
			.filter(
				(type, i, duplicateBindingTypes) =>
					duplicateBindingTypes.indexOf(type) === i
			);

		const differentTypes = bindingTypes.filter(
			(type, i) => bindingTypes.indexOf(type) === i
		);

		if (differentTypes.length > 1) {
			// we have multiple different types using the same name
			diagnostics.errors.push(
				`${bindingName} assigned to ${ENGLISH.format(differentTypes)} bindings.`
			);
		}

		sameType.forEach((bindingType) => {
			diagnostics.errors.push(
				`${bindingName} assigned to multiple ${bindingType} bindings.`
			);
		});
	}

	if (hasDuplicates) {
		const problem =
			"Bindings must have unique names, so that they can all be referenced in the worker.";
		const resolution = "Please change your bindings to have unique names.";
		diagnostics.errors.push(`${problem}\n${resolution}`);
	}

	return !hasDuplicates;
};

const validateServiceBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"services" bindings should be objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}
	let isValid = true;
	// Service bindings must have a binding, a service, optionally an environment, and, optionally an entrypoint.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isRequiredProperty(value, "service", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "service" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "environment", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "environment" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isOptionalProperty(value, "entrypoint", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "entrypoint" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	return isValid;
};

const validateAnalyticsEngineBinding: ValidatorFn = (
	diagnostics,
	field,
	value
) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"analytics_engine" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	// Service bindings must have a binding and optional dataset.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		!isOptionalProperty(value, "dataset", "string") ||
		(value as { dataset: string }).dataset?.length === 0
	) {
		diagnostics.errors.push(
			`"${field}" bindings should, optionally, have a string "dataset" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"dataset",
	]);

	return isValid;
};

const validateWorkerNamespaceBinding: ValidatorFn = (
	diagnostics,
	field,
	value
) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" binding should be objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}
	let isValid = true;
	// Worker namespace bindings must have a binding, and a namespace.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isRequiredProperty(value, "namespace", "string")) {
		diagnostics.errors.push(
			`"${field}" should have a string "namespace" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (hasProperty(value, "outbound")) {
		if (
			!validateWorkerNamespaceOutbound(
				diagnostics,
				`${field}.outbound`,
				value.outbound ?? {}
			)
		) {
			diagnostics.errors.push(`"${field}" has an invalid outbound definition.`);
			isValid = false;
		}
	}
	return isValid;
};

function validateWorkerNamespaceOutbound(
	diagnostics: Diagnostics,
	field: string,
	value: DispatchNamespaceOutbound
): boolean {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" should be an object, but got ${JSON.stringify(value)}`
		);
		return false;
	}

	let isValid = true;

	// Namespace outbounds need at least a service name
	isValid =
		isValid &&
		validateRequiredProperty(
			diagnostics,
			field,
			"service",
			value.service,
			"string"
		);
	isValid =
		isValid &&
		validateOptionalProperty(
			diagnostics,
			field,
			"environment",
			value.environment,
			"string"
		);
	isValid =
		isValid &&
		validateOptionalTypedArray(
			diagnostics,
			`${field}.parameters`,
			value.parameters,
			"string"
		);

	return isValid;
}

const validateMTlsCertificateBinding: ValidatorFn = (
	diagnostics,
	field,
	value
) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"mtls_certificates" bindings should be objects, but got ${JSON.stringify(
				value
			)}`
		);
		return false;
	}
	let isValid = true;
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (
		!isRequiredProperty(value, "certificate_id", "string") ||
		(value as { certificate_id: string }).certificate_id.length === 0
	) {
		diagnostics.errors.push(
			`"${field}" bindings should have a string "certificate_id" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"certificate_id",
	]);

	return isValid;
};

function validateQueues(envName: string): ValidatorFn {
	return (diagnostics, field, value, config) => {
		const fieldPath =
			config === undefined ? `${field}` : `env.${envName}.${field}`;

		if (typeof value !== "object" || Array.isArray(value) || value === null) {
			diagnostics.errors.push(
				`The field "${fieldPath}" should be an object but got ${JSON.stringify(
					value
				)}.`
			);
			return false;
		}

		let isValid = true;
		if (
			!validateAdditionalProperties(
				diagnostics,
				fieldPath,
				Object.keys(value),
				["consumers", "producers"]
			)
		) {
			isValid = false;
		}

		if (hasProperty(value, "consumers")) {
			const consumers = value.consumers;
			if (!Array.isArray(consumers)) {
				diagnostics.errors.push(
					`The field "${fieldPath}.consumers" should be an array but got ${JSON.stringify(
						consumers
					)}.`
				);
				isValid = false;
			}

			for (let i = 0; i < consumers.length; i++) {
				const consumer = consumers[i];
				const consumerPath = `${fieldPath}.consumers[${i}]`;
				if (!validateConsumer(diagnostics, consumerPath, consumer, config)) {
					isValid = false;
				}
			}
		}

		if (hasProperty(value, "producers")) {
			if (
				!validateBindingArray(envName, validateQueueBinding)(
					diagnostics,
					`${field}.producers`,
					value.producers,
					config
				)
			) {
				isValid = false;
			}
		}

		return isValid;
	};
}

const validateConsumer: ValidatorFn = (diagnostics, field, value, _config) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"${field}" should be a objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}

	let isValid = true;
	if (
		!validateAdditionalProperties(diagnostics, field, Object.keys(value), [
			"queue",
			"type",
			"max_batch_size",
			"max_batch_timeout",
			"max_retries",
			"dead_letter_queue",
			"max_concurrency",
			"visibility_timeout_ms",
			"retry_delay",
		])
	) {
		isValid = false;
	}

	if (!isRequiredProperty(value, "queue", "string")) {
		diagnostics.errors.push(
			`"${field}" should have a string "queue" field but got ${JSON.stringify(
				value
			)}.`
		);
	}

	const options: {
		key: string;
		type: "number" | "string" | "boolean";
	}[] = [
		{ key: "type", type: "string" },
		{ key: "max_batch_size", type: "number" },
		{ key: "max_batch_timeout", type: "number" },
		{ key: "max_retries", type: "number" },
		{ key: "dead_letter_queue", type: "string" },
		{ key: "max_concurrency", type: "number" },
		{ key: "visibility_timeout_ms", type: "number" },
		{ key: "retry_delay", type: "number" },
	];
	for (const optionalOpt of options) {
		if (!isOptionalProperty(value, optionalOpt.key, optionalOpt.type)) {
			diagnostics.errors.push(
				`"${field}" should, optionally, have a ${optionalOpt.type} "${
					optionalOpt.key
				}" field but got ${JSON.stringify(value)}.`
			);
			isValid = false;
		}
	}

	return isValid;
};

const validatePipelineBinding: ValidatorFn = (diagnostics, field, value) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`"pipeline" bindings should be objects, but got ${JSON.stringify(value)}`
		);
		return false;
	}
	let isValid = true;
	// Pipeline bindings must have a binding and a pipeline.
	if (!isRequiredProperty(value, "binding", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings must have a string "binding" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}
	if (!isRequiredProperty(value, "pipeline", "string")) {
		diagnostics.errors.push(
			`"${field}" bindings must have a string "pipeline" field but got ${JSON.stringify(
				value
			)}.`
		);
		isValid = false;
	}

	validateAdditionalProperties(diagnostics, field, Object.keys(value), [
		"binding",
		"pipeline",
	]);

	return isValid;
};

function normalizeAndValidateLimits(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawEnv: RawEnvironment
): Config["limits"] {
	if (rawEnv.limits) {
		validateRequiredProperty(
			diagnostics,
			"limits",
			"cpu_ms",
			rawEnv.limits.cpu_ms,
			"number"
		);
	}

	return inheritable(
		diagnostics,
		topLevelEnv,
		rawEnv,
		"limits",
		() => true,
		undefined
	);
}

/**
 * Validate the `migrations` configuration and return the normalized values.
 */
const validateMigrations: ValidatorFn = (diagnostics, field, value) => {
	const rawMigrations = value ?? [];
	if (!Array.isArray(rawMigrations)) {
		diagnostics.errors.push(
			`The optional "${field}" field should be an array, but got ${JSON.stringify(
				rawMigrations
			)}`
		);
		return false;
	}

	let valid = true;
	for (let i = 0; i < rawMigrations.length; i++) {
		const {
			tag,
			new_classes,
			new_sqlite_classes,
			renamed_classes,
			deleted_classes,
			...rest
		} = rawMigrations[i];

		valid =
			validateAdditionalProperties(
				diagnostics,
				"migrations",
				Object.keys(rest),
				[]
			) && valid;

		valid =
			validateRequiredProperty(
				diagnostics,
				`migrations[${i}]`,
				`tag`,
				tag,
				"string"
			) && valid;

		valid =
			validateOptionalTypedArray(
				diagnostics,
				`migrations[${i}].new_classes`,
				new_classes,
				"string"
			) && valid;

		valid =
			validateOptionalTypedArray(
				diagnostics,
				`migrations[${i}].new_sqlite_classes`,
				new_sqlite_classes,
				"string"
			) && valid;

		if (renamed_classes !== undefined) {
			if (!Array.isArray(renamed_classes)) {
				diagnostics.errors.push(
					`Expected "migrations[${i}].renamed_classes" to be an array of "{from: string, to: string}" objects but got ${JSON.stringify(
						renamed_classes
					)}.`
				);
				valid = false;
			} else if (
				renamed_classes.some(
					(c) =>
						typeof c !== "object" ||
						!isRequiredProperty(c, "from", "string") ||
						!isRequiredProperty(c, "to", "string")
				)
			) {
				diagnostics.errors.push(
					`Expected "migrations[${i}].renamed_classes" to be an array of "{from: string, to: string}" objects but got ${JSON.stringify(
						renamed_classes
					)}.`
				);
				valid = false;
			}
		}
		valid =
			validateOptionalTypedArray(
				diagnostics,
				`migrations[${i}].deleted_classes`,
				deleted_classes,
				"string"
			) && valid;
	}
	return valid;
};

const validateObservability: ValidatorFn = (diagnostics, field, value) => {
	if (value === undefined) {
		return true;
	}

	if (typeof value !== "object") {
		diagnostics.errors.push(
			`"${field}" should be an object but got ${JSON.stringify(value)}.`
		);
		return false;
	}

	const val = value as Observability;
	let isValid = true;

	isValid =
		validateRequiredProperty(
			diagnostics,
			field,
			"enabled",
			val.enabled,
			"boolean"
		) && isValid;

	isValid =
		validateOptionalProperty(
			diagnostics,
			field,
			"head_sampling_rate",
			val.head_sampling_rate,
			"number"
		) && isValid;

	isValid =
		validateAdditionalProperties(diagnostics, field, Object.keys(val), [
			"enabled",
			"head_sampling_rate",
		]) && isValid;

	const samplingRate = val?.head_sampling_rate;

	if (samplingRate && (samplingRate < 0 || samplingRate > 1)) {
		diagnostics.errors.push(
			`"${field}.head_sampling_rate" must be a value between 0 and 1.`
		);
	}

	return isValid;
};

function warnIfDurableObjectsHaveNoMigrations(
	diagnostics: Diagnostics,
	durableObjects: Config["durable_objects"],
	migrations: Config["migrations"]
) {
	if (
		Array.isArray(durableObjects.bindings) &&
		durableObjects.bindings.length > 0
	) {
		// intrinsic [durable_objects] implies [migrations]
		const exportedDurableObjects = (durableObjects.bindings || []).filter(
			(binding) => !binding.script_name
		);
		if (exportedDurableObjects.length > 0 && migrations.length === 0) {
			if (
				!exportedDurableObjects.some(
					(exportedDurableObject) =>
						typeof exportedDurableObject.class_name !== "string"
				)
			) {
				const durableObjectClassnames = exportedDurableObjects.map(
					(durable) => durable.class_name
				);

				diagnostics.warnings.push(dedent`
				In wrangler.toml, you have configured [durable_objects] exported by this Worker (${durableObjectClassnames.join(", ")}), but no [migrations] for them. This may not work as expected until you add a [migrations] section to your wrangler.toml. Add this configuration to your wrangler.toml:

				  \`\`\`
				  [[migrations]]
				  tag = "v1" # Should be unique for each entry
				  new_classes = [${durableObjectClassnames.map((name) => `"${name}"`).join(", ")}]
				  \`\`\`

				Refer to https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ for more details.`);
			}
		}
	}
}
