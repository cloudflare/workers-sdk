import { mkdir } from "fs/promises";
import { exit } from "process";
import { crash, logRaw, space, status, updateStatus } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { version as wranglerVersion } from "../../package.json";
import { readConfig } from "../config";
import { getConfigCache, purgeConfigCaches } from "../config-cache";
import { getCloudflareApiBaseUrl } from "../environment-variables/misc-variables";
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
import { ApiError, DeploymentMutationError, OpenAPI } from "./client";
import { wrap } from "./helpers/wrap";
import { idToLocationName, loadAccount } from "./locations";
import type { Config } from "../config";
import type { Scope } from "../user";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type {
	CompleteAccountCustomer,
	EnvironmentVariable,
	Label,
	NetworkParameters,
} from "./client";
import type { Arg } from "@cloudflare/cli/interactive";

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
	cb: (args: CommandArgumentsObject, config: Config) => Promise<void>
): (
	args: CommonYargsOptions &
		CommandArgumentsObject &
		CommonCloudchamberConfiguration
) => Promise<void> {
	return async (args) => {
		try {
			const config = readConfig(args);
			await fillOpenAPIConfiguration(config, args.json);
			await cb(args, config);
		} catch (err) {
			if (!args.json) {
				throw err;
			}

			if (err instanceof ApiError) {
				logger.log(JSON.stringify(err.body));
				return;
			}

			if (err instanceof Error) {
				logger.log(`${JSON.stringify({ error: err.message })}`);
				return;
			}

			logger.log(JSON.stringify(err));
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
	const api = getCloudflareApiBaseUrl();
	// This one will probably be cache'd already so it won't ask for the accountId again
	const accountId = config.account_id || (await getAccountId());
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

async function fillOpenAPIConfiguration(config: Config, json: boolean) {
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
			await getAccountId();
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
			crash("authenticating with the Cloudflare API:", err.message);
			return;
		}
	}

	// Get the loaded API token
	const token = getAPIToken();
	if (!token) {
		crash("unexpected apiToken not existing in credentials");
		exit(1);
	}

	const val = "apiToken" in token ? token.apiToken : null;
	// Don't try to support this method of authentication
	if (!val) {
		crash(
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
			crash("getting the API url:" + errApiURL.message);
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

		crash("loading Cloudchamber account failed:" + message);
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
		vcpu,
		memory,
		environmentVariables,
		labels,
		env,
		network,
	}: {
		image: string;
		location: string;
		vcpu: number;
		memory: string;
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
		["vCPU", `${vcpu}`],
		["memory", memory],
		["environment variables", environmentVariablesText],
		["labels", labelsText],
		...(network === undefined
			? []
			: [["IPv4", network.assign_ipv4 === "predefined" ? "yes" : "no"]]),
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
		crash(err.message);
		return;
	}

	if (typeof err.body === "string") {
		crash("There has been an internal error, please try again!");
		return;
	}

	if (!("error" in err.body)) {
		crash(err.message);
		return;
	}

	const errorMessage = err.body.error;
	if (!(errorMessage in DeploymentMutationError)) {
		crash(err.message);
		return;
	}

	const details: Record<string, string> = err.body.details ?? {};
	function renderAccountLimits() {
		return `${space(2)}${brandColor("Maximum VCPU per deployment")} ${
			account.limits.vcpu_per_deployment
		}\n${space(2)}${brandColor("Maximum total VCPU in your account")} ${
			account.limits.total_vcpu
		}\n${space(2)}${brandColor("Maximum memory per deployment")} ${
			account.limits.memory_per_deployment
		}\n${space(2)}${brandColor("Maximum total memory in your account")} ${
			account.limits.total_memory
		}`;
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

	crash(details["reason"] ?? errorEnumToErrorMessage[errorEnum]());
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
