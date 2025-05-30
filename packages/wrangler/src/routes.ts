import chalk from "chalk";
import { fetchResult } from "./cfetch";
import { configFileName } from "./config";
import { confirm, prompt } from "./dialogs";
import { getComplianceRegionSubdomain } from "./environment-variables/misc-variables";
import { UserError } from "./errors";
import { logger } from "./logger";
import type { ComplianceConfig } from "./environment-variables/misc-variables";

/**
 * Gets the <user-subdomain>.(fed.)workers.dev URL for the given account.
 */
export async function getWorkersDevSubdomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	configPath: string | undefined
): Promise<string> {
	try {
		// note: API docs say that this field is "name", but they're lying.
		const { subdomain } = await fetchResult<{ subdomain: string }>(
			complianceConfig,
			`/accounts/${accountId}/workers/subdomain`
		);
		return `${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
	} catch (e) {
		const error = e as { code?: number };
		if (typeof error === "object" && !!error && error.code === 10007) {
			// 10007 error code: not found
			// https://api.cloudflare.com/#worker-subdomain-get-subdomain

			logger.warn(
				"You need to register a workers.dev subdomain before publishing to workers.dev"
			);

			const wantsToRegister = await confirm(
				"Would you like to register a workers.dev subdomain now?",
				{ fallbackValue: false }
			);
			if (!wantsToRegister) {
				const solutionMessage = `You can either deploy your worker to one or more routes by specifying them in your ${configFileName(configPath)} file, or register a workers.dev subdomain here:`;
				const onboardingLink = `https://dash.cloudflare.com/${accountId}/workers/onboarding`;

				throw new UserError(`${solutionMessage}\n${onboardingLink}`);
			}

			return await registerSubdomain(complianceConfig, accountId, configPath);
		} else {
			throw e;
		}
	}
}

async function registerSubdomain(
	complianceConfig: ComplianceConfig,
	accountId: string,
	configPath: string | undefined
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
			const solutionMessage = `You can either deploy your worker to one or more routes by specifying them in your ${configFileName(configPath)} file, or register a workers.dev subdomain here:`;
			const onboardingLink = `https://dash.cloudflare.com/${accountId}/workers/onboarding`;

			throw new UserError(`${solutionMessage}\n${onboardingLink}`);
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
