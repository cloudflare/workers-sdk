import { mkdir } from "fs/promises";
import { logRaw, space, status, updateStatus } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import {
	ApiError,
	DeploymentMutationError,
	InstanceType,
	OpenAPI,
} from "@cloudflare/containers-shared";
import { version as wranglerVersion } from "../../package.json";
import { readConfig } from "../config";
import { getConfigCache, purgeConfigCaches } from "../config-cache";
import { constructStatusMessage } from "../core/CommandRegistry";
import { getCloudflareApiBaseUrl } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import {
	DefaultScopeKeys,
	getAccountFromCache,
	getAccountId,
	getAPIToken,
	getAuthFromEnv,
	getScopes,
	logout,
	reinitialiseAuthTokens,
	requireAuth,
	setLoginScopeKeys,
} from "../user";
import { printWranglerBanner } from "../wrangler-banner";
import { parseByteSize } from "./../parse";
import { wrap } from "./helpers/wrap";
import { idToLocationName, loadAccount } from "./locations";
import type { Config } from "../config";
import type { CloudchamberConfig, ContainerApp } from "../config/environment";
import type { Scope } from "../user";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { Arg } from "@cloudflare/cli/interactive";
import type {
	CompleteAccountCustomer,
	CreateApplicationRequest,
	EnvironmentVariable,
	Label,
	NetworkParameters,
	UserDeploymentConfiguration,
} from "@cloudflare/containers-shared";

export type CommonCloudchamberConfiguration = { json: boolean };

/**
 * Regular expression for matching an image name.
 *
 * See: https://github.com/opencontainers/distribution-spec/blob/v1.1.0/spec.md#pulling-manifests
 */
const imageRe = (() => {
	const alphaNumeric = "[a-z0-9]+";
	const separator = "(?:\\.|_|__|-+)";
	const port = ":[0-9]+";
	const domain = `${alphaNumeric}(?:${separator}${alphaNumeric})*`;
	const name = `(?:${domain}(?:${port})?/)?(?:${domain}/)*(?:${domain})`;
	const tag = ":([a-zA-Z0-9_][a-zA-Z0-9._-]{0,127})";
	const digest = "@(sha256:[A-Fa-f0-9]+)";
	const reference = `(?:${tag}(?:${digest})?|${digest})`;
	return new RegExp(`^(${name})${reference}$`);
})();

/**
 * Parse a container image name.
 */
export function parseImageName(value: string): {
	name?: string;
	tag?: string;
	digest?: string;
	err?: string;
} {
	const matches = value.match(imageRe);
	if (matches === null) {
		return {
			err: "Invalid image format: expected NAME:TAG[@DIGEST] or NAME@DIGEST",
		};
	}

	const name = matches[1];
	const tag = matches[2];
	const digest = matches[3] ?? matches[4];

	if (tag === "latest") {
		return { err: '"latest" tag is not allowed' };
	}

	return { name, tag, digest };
}

/**
 * Wrapper that parses wrangler configuration and authentication.
 * It also wraps exceptions and checks if they are from the RestAPI.
 *
 */
export function handleFailure<
	YargsObject,
	CommandArgumentsObject = YargsObject extends StrictYargsOptionsToInterfaceJSON<
		infer K
	>
		? K
		: never,
>(
	command: string,
	cb: (args: CommandArgumentsObject, config: Config) => Promise<void>
): (
	args: CommonYargsOptions &
		CommandArgumentsObject &
		CommonCloudchamberConfiguration
) => Promise<void> {
	return async (args) => {
		try {
			if (!args.json) {
				await printWranglerBanner();
				logger.warn(constructStatusMessage(command, "alpha"));
			}
			const config = readConfig(args);
			await fillOpenAPIConfiguration(config, args.json);
			await cb(args, config);
		} catch (err) {
			if (!args.json || !isNonInteractiveOrCI()) {
				throw err;
			}

			if (err instanceof ApiError) {
				logger.log(JSON.stringify(err.body));
				return;
			}

			if (err instanceof Error) {
				logger.log(JSON.stringify({ error: err.message }));
				return;
			}

			throw err;
		}
	};
}

export async function loadAccountSpinner({ json }: { json?: boolean }) {
	await promiseSpinner(loadAccount(), { message: "Loading account", json });
}

/**
 * Gets the API URL depending if the user is using old/admin based authentication.
 *
 */
async function getAPIUrl(config: Config) {
	const api = getCloudflareApiBaseUrl(config);
	// This one will probably be cache'd already so it won't ask for the accountId again
	const accountId = config.account_id || (await getAccountId(config));
	return `${api}/accounts/${accountId}/cloudchamber`;
}

export async function promiseSpinner<T>(
	promise: Promise<T>,
	{
		json = false,
		message = "Loading",
	}: { json?: boolean; message?: string } = {
		json: false,
		message: "Loading",
	}
): Promise<T> {
	if (json) {
		return promise;
	}
	const { start, stop } = spinner();
	start(message);
	const t = await promise.catch((err) => {
		stop();
		throw err;
	});
	stop();
	return t;
}

export async function fillOpenAPIConfiguration(config: Config, json: boolean) {
	const headers: Record<string, string> =
		OpenAPI.HEADERS !== undefined ? { ...OpenAPI.HEADERS } : {};

	// if the config cache folder doesn't exist, it means that there is not a node_modules folder in the tree
	if (Object.keys(getConfigCache("wrangler-account.json")).length === 0) {
		await wrap(mkdir("node_modules", {}));
		purgeConfigCaches();
	}

	const scopes = getScopes();
	const needsCloudchamberToken = !scopes?.find(
		(scope) => scope === "cloudchamber:write"
	);
	const cloudchamberScope: Scope[] = ["cloudchamber:write"];
	const scopesToSet: Scope[] =
		scopes == undefined
			? cloudchamberScope.concat(DefaultScopeKeys)
			: cloudchamberScope.concat(scopes);

	if (getAuthFromEnv() && needsCloudchamberToken) {
		setLoginScopeKeys(scopesToSet);
		// Wrangler will try to retrieve the oauth token and refresh it
		// for its internal fetch call even if we have AuthFromEnv.
		// Let's mock it
		reinitialiseAuthTokens({
			expiration_time: "2300-01-01:00:00:00+00:00",
			oauth_token: "_",
		});
	} else {
		if (needsCloudchamberToken && scopes) {
			logRaw(
				status.warning +
					" We need to re-authenticate to add a cloudchamber token..."
			);
			// cache account id
			await getAccountId(config);
			const account = getAccountFromCache();
			config.account_id = account?.id ?? config.account_id;
			await promiseSpinner(logout(), { json, message: "Revoking token" });
			purgeConfigCaches();
			reinitialiseAuthTokens({});
		}

		setLoginScopeKeys(scopesToSet);

		// Require either login, or environment variables being set to authenticate
		//
		// This will prompt the user for an accountId being chosen if they haven't configured the account id yet
		const [, err] = await wrap(requireAuth(config));
		if (err) {
			throw new UserError(
				`authenticating with the Cloudflare API: ${err.message}`
			);
		}
	}

	// Get the loaded API token
	const token = getAPIToken();
	if (!token) {
		throw new UserError("unexpected apiToken not existing in credentials");
	}

	const val = "apiToken" in token ? token.apiToken : null;
	// Don't try to support this method of authentication
	if (!val) {
		throw new UserError(
			"we don't allow for authKey/email credentials, use `wrangler login` or CLOUDFLARE_API_TOKEN env variable to authenticate"
		);
	}

	headers["Authorization"] = `Bearer ${val}`;
	// These are being set by the internal fetch of wrangler, but we are not using it
	// due to our OpenAPI codegenerated client.
	headers["User-Agent"] = `wrangler/${wranglerVersion}`;
	OpenAPI.CREDENTIALS = "omit";
	if (OpenAPI.BASE.length === 0) {
		const [base, errApiURL] = await wrap(getAPIUrl(config));
		if (errApiURL) {
			throw new UserError("getting the API url: " + errApiURL.message);
		}

		OpenAPI.BASE = base;
	}

	OpenAPI.HEADERS = headers;
	const [, err] = await wrap(loadAccountSpinner({ json }));

	if (err) {
		let message = err.message;
		if (json && err instanceof ApiError) {
			message = JSON.stringify(err);
		}

		throw new UserError("Loading account failed: " + message);
	}
}

export function interactWithUser(config: { json?: boolean }): boolean {
	return !config.json && !isNonInteractiveOrCI();
}

type NonObject = undefined | null | boolean | string | number;

export type DeepComplete<T> = T extends NonObject
	? T extends undefined
		? never
		: T
	: DeepCompleteObject<T>;

declare type DeepCompleteObject<T> = {
	[K in keyof T]-?: DeepComplete<T[K]>;
};

export function checkEverythingIsSet<T>(
	object: T,
	keys: Array<keyof T>
): DeepComplete<T> {
	keys.forEach((key) => {
		if (object[key] === undefined) {
			throw new Error(
				`${key as string} is required but it's not passed as an argument`
			);
		}
	});

	return object as DeepComplete<T>;
}

export function renderDeploymentConfiguration(
	action: "modify" | "create",
	{
		image,
		location,
		instanceType,
		vcpu,
		memoryMib,
		environmentVariables,
		labels,
		env,
		network,
	}: {
		image: string;
		location: string;
		instanceType?: InstanceType;
		vcpu: number;
		memoryMib: number;
		environmentVariables: EnvironmentVariable[] | undefined;
		labels: Label[] | undefined;
		env?: string;
		network?: NetworkParameters;
	}
) {
	let environmentVariablesText = "[]";
	if (environmentVariables !== undefined) {
		if (environmentVariables.length !== 0) {
			environmentVariablesText =
				"\n" +
				environmentVariables
					.map((ev) => "- " + dim(ev.name + ":" + ev.value))
					.join("\n")
					.trim();
		}
	} else if (action === "create") {
		environmentVariablesText = `\nNo environment variables added! You can set some under [${
			env ? "env." + env + "." : ""
		}vars] and via command line`;
	}

	let labelsText = "[]";
	if (labels !== undefined && labels.length !== 0) {
		labelsText =
			"\n" +
			labels
				.map((ev) => "- " + dim(ev.name + ":" + ev.value))
				.join("\n")
				.trim();
	}

	const containerInformation = [
		["image", image],
		["location", idToLocationName(location)],
		["environment variables", environmentVariablesText],
		["labels", labelsText],
		...(network === undefined
			? []
			: [["IPv4", network.assign_ipv4 === "predefined" ? "yes" : "no"]]),
		...(instanceType === undefined
			? [
					["vCPU", `${vcpu}`],
					["memory", `${memoryMib} MiB`],
				]
			: [["instance type", `${instanceType}`]]),
	] as const;

	updateStatus(
		`You're about to ${action} a container with the following configuration\n` +
			containerInformation
				.map(([key, text]) => `${brandColor(key)} ${dim(text)}`)
				.join("\n")
	);
}

export function renderDeploymentMutationError(
	account: CompleteAccountCustomer,
	err: Error
) {
	if (!(err instanceof ApiError)) {
		throw new UserError(err.message);
	}

	if (typeof err.body === "string") {
		throw new UserError("There has been an internal error, please try again!");
	}

	if (!("error" in err.body)) {
		throw new UserError(err.message);
	}

	const errorMessage = err.body.error;
	if (!(errorMessage in DeploymentMutationError)) {
		throw new UserError(err.message);
	}

	const details: Record<string, string> = err.body.details ?? {};
	function renderAccountLimits() {
		return [
			`${space(2)}${brandColor("Maximum VCPU per deployment")} ${account.limits.vcpu_per_deployment}`,
			`${space(2)}${brandColor("Maximum total VCPU in your account")} ${account.limits.total_vcpu}`,
			`${space(2)}${brandColor("Maximum memory per deployment")} ${account.limits.memory_mib_per_deployment} MiB`,
			`${space(2)}${brandColor("Maximum total memory in your account")} ${account.limits.total_memory_mib} MiB`,
		].join("\n");
	}

	function renderInvalidInputDetails(inputDetails: Record<string, string>) {
		return `${Object.keys(inputDetails)
			.map((key) => `${space(2)}- ${key}: ${inputDetails[key]}`)
			.join("\n")}`;
	}

	const errorEnum = errorMessage as DeploymentMutationError;
	const errorEnumToErrorMessage: Record<DeploymentMutationError, () => string> =
		{
			[DeploymentMutationError.LOCATION_NOT_ALLOWED]: () =>
				"The location you have chosen is not allowed, try with another one",
			[DeploymentMutationError.LOCATION_SURPASSED_BASE_LIMITS]: () =>
				"The location you have chosen doesn't allow that deployment configuration due to its limits",
			[DeploymentMutationError.SURPASSED_BASE_LIMITS]: () =>
				"You deployment surpasses the base limits of your account\n" +
				renderAccountLimits(),
			[DeploymentMutationError.VALIDATE_INPUT]: () =>
				"Your deployment configuration has invalid inputs\n" +
				renderInvalidInputDetails(err.body.details),
			[DeploymentMutationError.SURPASSED_TOTAL_LIMITS]: () =>
				"You have surpassed the limits of your account\n" +
				renderAccountLimits(),
			[DeploymentMutationError.IMAGE_REGISTRY_NOT_CONFIGURED]: () =>
				"The image registry you are trying to use is not configured. Use the 'wrangler cloudchamber registries configure' command to configure the registry.\n",
		};

	throw new UserError(
		details["reason"] ?? errorEnumToErrorMessage[errorEnum]()
	);
}

function sortEnvironmentVariables(environmentVariables: EnvironmentVariable[]) {
	environmentVariables.sort((a, b) => a.name.localeCompare(b.name));
}

export function collectEnvironmentVariables(
	deploymentEnv: EnvironmentVariable[] | undefined,
	config: Config,
	envArgs: string[] | undefined
): EnvironmentVariable[] | undefined {
	const envMap: Map<string, string> = new Map();

	// environment variables that are already in use are of
	// lowest precedence
	if (deploymentEnv !== undefined) {
		deploymentEnv.forEach((ev) => envMap.set(ev.name, ev.value));
	}

	Object.entries(config.vars).forEach(([name, value]) =>
		envMap.set(name, value?.toString() ?? "")
	);

	// environment variables passed as command-line arguments are of
	// highest precedence
	if (envArgs !== undefined) {
		envArgs.forEach((v) => {
			const [name, ...value] = v.split(":");
			envMap.set(name, value.join(":"));
		});
	}

	if (envMap.size === 0) {
		return undefined;
	}

	const env: EnvironmentVariable[] = Array.from(envMap).map(
		([name, value]) => ({ name: name, value: value })
	);
	sortEnvironmentVariables(env);

	return env;
}

export async function promptForEnvironmentVariables(
	environmentVariables: EnvironmentVariable[] | undefined,
	initiallySelected: string[],
	allowSkipping: boolean
): Promise<EnvironmentVariable[] | undefined> {
	if (environmentVariables === undefined || environmentVariables.length == 0) {
		return undefined;
	}

	let options = [
		{ label: "Use all of them", value: "all" },
		{ label: "Use some", value: "select" },
		{ label: "Do not use any", value: "none" },
	];
	if (allowSkipping) {
		options = [{ label: "Do not modify", value: "skip" }].concat(options);
	}
	const action = await inputPrompt({
		question:
			"You have environment variables defined, what do you want to do for this deployment?",
		label: "",
		defaultValue: false,
		helpText: "",
		type: "select",
		options,
	});

	if (action === "skip") {
		return undefined;
	}
	if (action === "all") {
		return environmentVariables;
	}

	if (action === "select") {
		const selectedNames = await inputPrompt<string[]>({
			question: "Select the environment variables you want to use",
			label: "",
			defaultValue: initiallySelected,
			helpText: "Use the 'space' key to select. Submit with 'enter'",
			type: "multiselect",
			options: environmentVariables.map((ev) => ({
				label: ev.name,
				value: ev.name,
			})),
			validate: (values: Arg) => {
				if (!Array.isArray(values)) {
					return "unknown error";
				}
			},
		});

		const selectedNamesSet = new Set(selectedNames);
		const selectedEnvironmentVariables = [];

		for (const ev of environmentVariables) {
			if (selectedNamesSet.has(ev.name)) {
				selectedEnvironmentVariables.push(ev);
			}
		}

		return selectedEnvironmentVariables;
	}

	return [];
}

function sortLabels(labels: Label[]) {
	labels.sort((a, b) => a.name.localeCompare(b.name));
}

export function collectLabels(
	labelArgs: string[] | undefined
): EnvironmentVariable[] | undefined {
	const labelMap: Map<string, string> = new Map();

	// environment variables passed as command-line arguments are of
	// highest precedence
	if (labelArgs !== undefined) {
		labelArgs.forEach((v) => {
			const [name, ...value] = v.split(":");
			labelMap.set(name, value.join(":"));
		});
	}

	if (labelMap.size === 0) {
		return undefined;
	}

	const labels: Label[] = Array.from(labelMap).map(([name, value]) => ({
		name: name,
		value: value,
	}));
	sortLabels(labels);

	return labels;
}

export async function promptForLabels(
	labels: Label[] | undefined,
	initiallySelected: string[],
	allowSkipping: boolean
): Promise<Label[] | undefined> {
	if (labels === undefined || labels.length == 0) {
		return undefined;
	}

	let options = [
		{ label: "Use all of them", value: "all" },
		{ label: "Use some", value: "select" },
		{ label: "Do not use any", value: "none" },
	];
	if (allowSkipping) {
		options = [{ label: "Do not modify", value: "skip" }].concat(options);
	}
	const action = await inputPrompt({
		question:
			"You have labels defined, what do you want to do for this deployment?",
		label: "",
		defaultValue: false,
		helpText: "",
		type: "select",
		options,
	});

	if (action === "skip") {
		return undefined;
	}
	if (action === "all") {
		return labels;
	}

	if (action === "select") {
		const selectedNames = await inputPrompt<string[]>({
			question: "Select the labels you want to use",
			label: "",
			defaultValue: initiallySelected,
			helpText: "Use the 'space' key to select. Submit with 'enter'",
			type: "multiselect",
			options: labels.map((label) => ({
				label: label.name,
				value: label.name,
			})),
			validate: (values: Arg) => {
				if (!Array.isArray(values)) {
					return "unknown error";
				}
			},
		});

		const selectedNamesSet = new Set(selectedNames);
		const selectedLabels = [];

		for (const ev of labels) {
			if (selectedNamesSet.has(ev.name)) {
				selectedLabels.push(ev);
			}
		}

		return selectedLabels;
	}

	return [];
}

export async function promptForInstanceType(
	allowSkipping: boolean
): Promise<InstanceType | undefined> {
	let options = [
		{ label: "dev: 1/16 vCPU, 256 MiB memory, 2 GB disk", value: "dev" },
		{ label: "basic: 1/4 vCPU, 1 GiB memory, 4 GB disk", value: "basic" },
		{ label: "standard: 1/2 vCPU, 4 GiB memory, 4 GB disk", value: "standard" },
	];
	if (allowSkipping) {
		options = [{ label: "Do not set", value: "skip" }].concat(options);
	}
	const action = await inputPrompt({
		question: "Which instance type should we use for your container?",
		label: "",
		defaultValue: false,
		helpText: "",
		type: "select",
		options,
	});

	switch (action) {
		case "dev":
			return InstanceType.DEV;
		case "basic":
			return InstanceType.BASIC;
		case "standard":
			return InstanceType.STANDARD;
		default:
			return undefined;
	}
}

// Return the amount of memory to use (in MiB) for a deployment given the
// provided arguments and configuration.
export function resolveMemory(
	args: { memory: string | undefined },
	config: CloudchamberConfig
): number | undefined {
	const MiB = 1024 * 1024;

	const memory = args.memory ?? config.memory;
	if (memory !== undefined) {
		return Math.round(parseByteSize(memory, 1024) / MiB);
	}

	return undefined;
}

// Return the amount of disk size in (MB) for an application, falls back to the account limits if the app config doesn't exist
// sometimes the user wants to just build a container here, we should allow checking those based on the account limits if
// app.configuration is not set
// ordering: app.configuration.disk.size -> account.limits.disk_mb_per_deployment -> default fallback to 2GB in bytes
export function resolveAppDiskSize(
	account: CompleteAccountCustomer,
	app: ContainerApp | undefined
): number | undefined {
	if (app === undefined) {
		return undefined;
	}
	const disk = app.configuration.disk?.size ?? "2GB";
	return Math.round(parseByteSize(disk));
}

// Checks that instance type is one of 'dev', 'basic', or 'standard' and that it is not being set alongside memory or vcpu.
// Returns the instance type to use if correctly set.
export function checkInstanceType(
	args: {
		instanceType: string | undefined;
		memory: string | undefined;
		vcpu: number | undefined;
	},
	config: CloudchamberConfig
): InstanceType | undefined {
	const instance_type = args.instanceType ?? config.instance_type;
	if (instance_type === undefined) {
		return;
	}

	// If instance_type is specified as an argument, it will override any
	// memory or vcpu specified in the config
	if (args.memory !== undefined || args.vcpu !== undefined) {
		throw new UserError(
			`Field "instance_type" is mutually exclusive with "memory" and "vcpu". These fields cannot be set together.`
		);
	}

	switch (instance_type) {
		case "dev":
			return InstanceType.DEV;
		case "basic":
			return InstanceType.BASIC;
		case "standard":
			return InstanceType.STANDARD;
		default:
			throw new UserError(
				`"instance_type" field value is expected to be one of "dev", "basic", or "standard", but got "${instance_type}"`
			);
	}
}

// infers the instance type from a given configuration
function inferInstanceType(
	configuration: UserDeploymentConfiguration
): InstanceType | undefined {
	if (
		configuration?.disk?.size_mb !== undefined &&
		configuration?.memory_mib !== undefined &&
		configuration?.vcpu !== undefined
	) {
		if (
			configuration.disk.size_mb === 2000 &&
			configuration.memory_mib === 256 &&
			configuration.vcpu === 0.0625
		) {
			return InstanceType.DEV;
		} else if (
			configuration.disk.size_mb === 4000 &&
			configuration.memory_mib === 1024 &&
			configuration.vcpu === 0.25
		) {
			return InstanceType.BASIC;
		} else if (
			configuration.disk.size_mb === 4000 &&
			configuration.memory_mib === 4096 &&
			configuration.vcpu === 0.5
		) {
			return InstanceType.STANDARD;
		}
	}
}

// removes any disk, memory, or vcpu that have been set in an objects configuration. Used for rendering
// diffs.
export function cleanForInstanceType(
	app: CreateApplicationRequest
): ContainerApp {
	if (!("configuration" in app)) {
		return app as ContainerApp;
	}

	const instance_type = inferInstanceType(app.configuration);
	if (instance_type !== undefined) {
		app.configuration.instance_type = instance_type;
	}

	delete app.configuration.disk;
	delete app.configuration.memory;
	delete app.configuration.memory_mib;
	delete app.configuration.vcpu;

	return app as ContainerApp;
}
