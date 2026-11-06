import { fetchPagedListResult, fetchResult } from "../../cfetch";
import { requireAuth } from "../../user";
import type {
	ConnectivityNetwork,
	CreateConnectivityNetworkRequest,
	UpdateConnectivityNetworkRequest,
} from "./index";
import type { Config } from "@cloudflare/workers-utils";

export async function createNetwork(
	config: Config,
	body: CreateConnectivityNetworkRequest
): Promise<ConnectivityNetwork> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/networks`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}
	);
}

export async function deleteNetwork(
	config: Config,
	networkId: string
): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/networks/${networkId}`,
		{
			method: "DELETE",
		}
	);
}

export async function getNetwork(
	config: Config,
	networkId: string
): Promise<ConnectivityNetwork> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/networks/${networkId}`,
		{
			method: "GET",
		}
	);
}

export async function listNetworks(
	config: Config
): Promise<ConnectivityNetwork[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult(
		config,
		`/accounts/${accountId}/connectivity/directory/networks`,
		{
			method: "GET",
		}
	);
}

export async function updateNetwork(
	config: Config,
	networkId: string,
	body: UpdateConnectivityNetworkRequest
): Promise<ConnectivityNetwork> {
	const accountId = await requireAuth(config);

	return await fetchResult(
		config,
		`/accounts/${accountId}/connectivity/directory/networks/${networkId}`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}
	);
}
