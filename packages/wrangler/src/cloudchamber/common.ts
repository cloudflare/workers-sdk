import { space, updateStatus } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import {
	ApiError,
	DeploymentMutationError,
	OpenAPI,
} from "@cloudflare/containers-shared";
import {
	getCloudflareApiBaseUrl,
	parseByteSize,
	UserError,
} from "@cloudflare/workers-utils";
import { addAuthorizationHeader, addUserAgent } from "../cfetch/internal";
import { loadConfig } from "../config";
import { constructStatusMessage } from "../core/CommandRegistry";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { getScopes, printScopes, requireApiToken, requireAuth } from "../user";
import { printWranglerBanner } from "../wrangler-banner";
import { wrap } from "./helpers/wrap";
import { idToLocationName } from "./locations";
import type { containersScope } from "../containers";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Arg } from "@cloudflare/cli/interactive";
import type {
	CompleteAccountCustomer,
	EnvironmentVariable,
	InstanceType,
	Label,
	NetworkParameters,
} from "@cloudflare/containers-shared";
import type { CloudchamberConfig, Config } from "@cloudflare/workers-utils";

export const cloudchamberScope = "cloudchamber:write" as const;

const containerIdRegexp = /[^/]{36}/;

export function isValidContainerID(value: string): boolean {
	const matches = value.match(containerIdRegexp);
	return matches !== null;
}

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
	CommandArgumentsObject = YargsObject extends StrictYargsOptionsToInterface<
		infer K
	>
		? K
		: never,
>(
	command: string,
	cb: (args: CommandArgumentsObject, config: Config) => Promise<void>,
	scope: typeof cloudchamberScope | typeof containersScope
): (args: CommonYargsOptions & CommandArgumentsObject) => Promise<void> {
	return async (args) => {
		const isJson = "json" in args ? args.json === true : false;
		if (!isNonInteractiveOrCI() && !isJson) {
			await printWranglerBanner();
			const commandStatus = command.includes("cloudchamber")
				? "alpha"
				: "open beta";
			logger.warn(constructStatusMessage(command, commandStatus));
		}
		const config = await loadConfig(args);
		await fillOpenAPIConfiguration(config, scope);
		await cb(args, config);
	};
}

/**
 * Gets the API URL depending if the user is using old/admin based authentication.
 *
 */
async function getAPIUrl(
	config: Config,
	accountId: string,
	scope: typeof cloudchamberScope | typeof containersScope
) {
	const api = getCloudflareApiBaseUrl(config);

	const endpoint = scope === cloudchamberScope ? "cloudchamber" : "containers";

	return `${api}/accounts/${accountId}/${endpoint}`;
}

export async function promiseSpinner<T>(
	promise: Promise<T>,
	{
		message,
	}: {
		message: string;
	} = {
		message: "Loading",
	}
): Promise<T> {
	if (isNonInteractiveOrCI()) {
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

export async function fillOpenAPIConfiguration(
	config: Config,
	scope: typeof containersScope | typeof cloudchamberScope
) {
	const headers = new Headers();

	const accountId = await requireAuth(config);
	const auth = requireApiToken();
	const scopes = getScopes();
	if (scopes !== undefined && !scopes.includes(scope)) {
		logger.error(`You don't have '${scope}' in your list of scopes`);
		printScopes(scopes ?? []);
		throw new UserError(
			`You need '${scope}', try logging in again or creating an appropiate API token`
		);
	}

	addAuthorizationHeader(headers, auth);
	addUserAgent(headers);

	OpenAPI.CREDENTIALS = "omit";
	if (OpenAPI.BASE.length === 0) {
		const [base, errApiURL] = await wrap(getAPIUrl(config, accountId, scope));
		if (errApiURL) {
			throw new UserError("getting the API url: " + errApiURL.message);
		}

		OpenAPI.BASE = base;
	}

	OpenAPI.HEADERS = {
		...(OpenAPI.HEADERS ?? {}),
		...Object.fromEntries(headers.entries()),
	};
	OpenAPI.LOGGER = logger;
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
