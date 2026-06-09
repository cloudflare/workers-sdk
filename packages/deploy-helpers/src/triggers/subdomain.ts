import {
	configFileName,
	getComplianceRegionSubdomain,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { confirm, fetchResult, logger, prompt } from "../shared/context";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type WorkersDevSubdomainRegistrationContext = "workers_dev" | "workflows";

type GetWorkersDevSubdomainOptions = {
	configPath?: string | undefined;
	abortSignal?: AbortSignal | undefined;
	registrationContext?: WorkersDevSubdomainRegistrationContext | undefined;
};

/**
 * Gets the <user-subdomain>.(fed.)workers.dev URL for the given account.
 */
export async function getWorkersDevSubdomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	options: GetWorkersDevSubdomainOptions = {}
): Promise<string> {
	const {
		configPath,
		abortSignal,
		registrationContext = "workers_dev",
	} = options;

	try {
		// note: API docs say that this field is "name", but they're lying.
		const { subdomain } = await fetchResult<{ subdomain: string }>(
			complianceConfig,
			`/accounts/${accountId}/workers/subdomain`,
			undefined,
			undefined,
			abortSignal
		);
		return `${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
	} catch (e) {
		const error = e as { code?: number };
		if (typeof error !== "object" || !error || error.code !== 10007) {
			throw e;
		}

		// 10007 error code: not found
		// https://api.cloudflare.com/#worker-subdomain-get-subdomain
		logger.warn(getRegistrationWarning(registrationContext));

		const wantsToRegister = await confirm(
			"Would you like to register a workers.dev subdomain now?",
			{ fallbackValue: false }
		);
		if (!wantsToRegister) {
			throw getRegistrationDeclinedError(
				registrationContext,
				accountId,
				configPath
			);
		}

		return await registerSubdomain(
			complianceConfig,
			accountId,
			configPath,
			registrationContext
		);
	}
}

function getRegistrationWarning(
	registrationContext: WorkersDevSubdomainRegistrationContext
): string {
	switch (registrationContext) {
		case "workflows":
			return "You need to register a workers.dev subdomain before deploying Workflows";
		case "workers_dev":
			return "You need to register a workers.dev subdomain before publishing to workers.dev";
		default: {
			const _exhaustive: never = registrationContext;
			return _exhaustive;
		}
	}
}

function getRegistrationDeclinedError(
	registrationContext: WorkersDevSubdomainRegistrationContext,
	accountId: string,
	configPath: string | undefined
): UserError {
	const onboardingLink = `https://dash.cloudflare.com/${accountId}/workers/onboarding`;
	switch (registrationContext) {
		case "workflows":
			return new UserError(
				`Workflows require your account to have a workers.dev subdomain. Register a workers.dev subdomain here:\n${onboardingLink}`,
				{
					telemetryMessage: "workflows workers dev registration declined",
				}
			);
		case "workers_dev": {
			const solutionMessage = `You can either deploy your worker to one or more routes by specifying them in your ${configFileName(configPath)} file, or register a workers.dev subdomain here:`;
			return new UserError(`${solutionMessage}\n${onboardingLink}`, {
				telemetryMessage: "routes workers dev registration declined",
			});
		}
		default: {
			const _exhaustive: never = registrationContext;
			return _exhaustive;
		}
	}
}

async function registerSubdomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	configPath: string | undefined,
	registrationContext: WorkersDevSubdomainRegistrationContext
): Promise<string> {
	let subdomain: string | undefined;

	while (subdomain === undefined) {
		const potentialName = await prompt(
			"What would you like your workers.dev subdomain to be? It will be accessible at https://<subdomain>.workers.dev"
		);

		if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(potentialName)) {
			logger.warn(
				`${potentialName} is invalid, please choose another subdomain.`
			);
			continue;
		}

		try {
			await fetchResult<{ subdomain: string }>(
				complianceConfig,
				`/accounts/${accountId}/workers/subdomains/${potentialName}`
			);
		} catch (err) {
			const subdomainAvailabilityCheckError = err as { code?: number };

			if (
				typeof subdomainAvailabilityCheckError === "object" &&
				!!subdomainAvailabilityCheckError
			) {
				if (subdomainAvailabilityCheckError.code === 10032) {
					// oddly enough, this is a `subdomain_unavailable` error, meaning...that the subdomain
					// doesn't exist. and we can register it. this is exactly how the dashboard does it.
				} else if (subdomainAvailabilityCheckError.code === 10031) {
					logger.error(
						"Subdomain is unavailable, please try a different subdomain"
					);
					continue;
				} else {
					logger.error("An unexpected error occurred, please try again.");
					continue;
				}
			}
		}

		const ok = await confirm(
			`Creating a workers.dev subdomain for your account at ${chalk.blue(
				chalk.underline(
					`https://${potentialName}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`
				)
			)}. Ok to proceed?`
		);
		if (!ok) {
			throw getRegistrationDeclinedError(
				registrationContext,
				accountId,
				configPath
			);
		}

		try {
			const result = await fetchResult<{ subdomain: string }>(
				complianceConfig,
				`/accounts/${accountId}/workers/subdomain`,
				{
					method: "PUT",
					body: JSON.stringify({ subdomain: potentialName }),
				}
			);
			subdomain = result.subdomain;
		} catch (err) {
			const subdomainCreationError = err as { code?: number };
			if (
				typeof subdomainCreationError === "object" &&
				!!subdomainCreationError &&
				subdomainCreationError.code !== undefined
			) {
				switch (subdomainCreationError.code) {
					case 10031:
						logger.error(
							"Subdomain is unavailable, please try a different subdomain."
						);
						break;
					default:
						logger.error("An unexpected error occurred, please try again.");
						break;
				}
			}
		}
	}

	logger.log("Success! It may take a few minutes for DNS records to update.");
	logger.log(
		`Visit ${chalk.blue(
			chalk.underline(
				`https://dash.cloudflare.com/${accountId}/workers/subdomain`
			)
		)} to edit your workers.dev subdomain`
	);

	return `${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
}
