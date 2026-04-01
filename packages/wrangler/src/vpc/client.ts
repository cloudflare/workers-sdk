import { UserError } from "@cloudflare/workers-utils";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { logger } from "../logger";
import { requireAuth } from "../user";
import type { Binding } from "../api/startDevWorker/types";
import type { ConnectivityService, ConnectivityServiceRequest } from "./index";
import type { Config } from "@cloudflare/workers-utils";

export async function createService(
	config: Config,
	body: ConnectivityServiceRequest
): Promise<ConnectivityService> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/services`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}
	);
}

export async function deleteService(
	config: Config,
	serviceId: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/services/${serviceId}`,
		{
			method: "DELETE",
		}
	);
}

export async function getService(
	config: Config,
	serviceId: string
): Promise<ConnectivityService> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/services/${serviceId}`,
		{
			method: "GET",
		}
	);
}

export async function listServices(
	config: Config
): Promise<ConnectivityService[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult(
		config,
		`/accounts/${accountId}/connectivity/directory/services`,
		{
			method: "GET",
		}
	);
}

export async function updateService(
	config: Config,
	serviceId: string,
	body: ConnectivityServiceRequest
): Promise<ConnectivityService> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/services/${serviceId}`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}
	);
}

export async function getServiceByName(
	config: Config,
	name: string
): Promise<ConnectivityService> {
	const services = await listServices(config);
	const matches = services.filter((s) => s.name === name);
	if (matches.length === 0) {
		throw new UserError(
			`No VPC service found with name "${name}". Use "wrangler vpc service list" to see available services.`
		);
	}
	if (matches.length > 1) {
		throw new UserError(
			`Multiple VPC services found with name "${name}". Use "service_id" instead to specify the exact service.`
		);
	}
	return matches[0];
}

/**
 * Resolves VPC service bindings that use `service_name` instead of `service_id`.
 * Looks up each named service via the API and replaces the `service_name` field with `service_id`.
 */
export async function resolveVpcServiceBindings(
	config: Config,
	bindings: Record<string, Binding>
): Promise<void> {
	const toResolve: { bindingName: string; serviceName: string }[] = [];
	for (const [bindingName, binding] of Object.entries(bindings)) {
		if (
			binding.type === "vpc_service" &&
			!binding.service_id &&
			binding.service_name
		) {
			toResolve.push({ bindingName, serviceName: binding.service_name });
		}
	}

	if (toResolve.length === 0) {
		return;
	}

	// Fetch all services once and resolve all names from the cached list
	const allServices = await listServices(config);

	for (const { bindingName, serviceName } of toResolve) {
		const matches = allServices.filter((s) => s.name === serviceName);
		if (matches.length === 0) {
			throw new UserError(
				`VPC service binding "${bindingName}": no service found with name "${serviceName}". Use "wrangler vpc service list" to see available services.`
			);
		}
		if (matches.length > 1) {
			throw new UserError(
				`VPC service binding "${bindingName}": multiple services found with name "${serviceName}". Use "service_id" instead to specify the exact service.`
			);
		}
		const binding = bindings[bindingName] as Extract<
			Binding,
			{ type: "vpc_service" }
		>;
		logger.log(
			`Resolved VPC service "${serviceName}" to service_id "${matches[0].service_id}" for binding "${bindingName}".`
		);
		binding.service_id = matches[0].service_id;
		delete binding.service_name;
	}
}
