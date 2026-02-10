import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
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
