import { constructWranglerConfig } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "../environment-variables/misc-variables";
import type { FullWorkerConfig, RawConfig } from "@cloudflare/workers-utils";

/**
 * Downloads all information required to construct a Wrangler config file for a Worker from the API
 */
export async function fetchWorkerConfig(
	accountId: string,
	workerName: string,
	environment: string
): Promise<FullWorkerConfig> {
	const [
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	] = await Promise.all([
		fetchResult<FullWorkerConfig["bindings"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/bindings`
		),
		fetchResult<FullWorkerConfig["routes"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/routes?show_zonename=true`
		),
		fetchResult<FullWorkerConfig["customDomains"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/domains/records?page=0&per_page=5&service=${workerName}&environment=${environment}`
		),
		fetchResult<FullWorkerConfig["subdomainStatus"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}/subdomain`
		),
		fetchResult<FullWorkerConfig["serviceEnvMetadata"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/services/${workerName}/environments/${environment}`
		),
		fetchResult<FullWorkerConfig["cronTriggers"]>(
			COMPLIANCE_REGION_CONFIG_UNKNOWN,
			`/accounts/${accountId}/workers/scripts/${workerName}/schedules`
		),
	]).catch((e) => {
		throw new Error(
			`Error Occurred: Unable to fetch bindings, routes, or services metadata from the dashboard. Please try again later.`,
			{ cause: e }
		);
	});
	return {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	};
}

/**
 * Downloads all the remote information we can gather for a worker and from them generates a raw configuration object that
 * approximates what a wrangler config object for the worker was/would have been.
 *
 * @param workerName The name of the worker
 * @param environment The target environment for the worker
 * @param entrypoint The worker's entrypoint
 * @param accountId The ID of the account owning the worker
 * @returns A RawConfig object that bests represents the remote configuration of the worker
 */
export async function downloadWorkerConfig(
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string
): Promise<RawConfig> {
	const {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	} = await fetchWorkerConfig(accountId, workerName, environment);

	return constructWranglerConfig(workerName, entrypoint, {
		bindings,
		routes,
		customDomains,
		subdomainStatus,
		serviceEnvMetadata,
		cronTriggers,
	});
}
