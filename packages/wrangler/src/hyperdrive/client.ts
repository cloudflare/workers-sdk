import { fetchPagedListResult, fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "@cloudflare/workers-utils";

export type HyperdriveConfig = {
	id: string;
	name: string;
	origin: PublicOrigin;
	caching?: CachingOptions;
	mtls?: Mtls;
	origin_connection_limit?: number;
};

export type OriginDatabase = {
	scheme: string;
	database: string;
	user: string;

	// ensure password not set, must use OriginCommonWithSecrets
	password?: never;
};

export type OriginDatabaseWithSecrets = Omit<OriginDatabase, "password"> & {
	password: string;
};

export type NetworkOriginHoA = {
	host: string;
	access_client_id: string;

	// Ensure post is not set, and secrets are not set
	port?: never;
	access_client_secret?: never;
};

export type NetworkOriginHoAWithSecrets = Omit<
	NetworkOriginHoA,
	"access_client_secret"
> & {
	access_client_secret: string;
};

export type NetworkOriginHostAndPort = {
	host: string;
	port: number;

	// Ensure HoA fields are not set
	access_client_id?: never;
	access_client_secret?: never;
};

// NetworkOrigin is never partial in the API, it must be submitted in it's entirety
export type NetworkOrigin = NetworkOriginHoA | NetworkOriginHostAndPort;
export type NetworkOriginWithSecrets =
	| NetworkOriginHoAWithSecrets
	| NetworkOriginHostAndPort;

// Public responses of the full PublicOrigin type are never partial in the API
export type PublicOrigin = OriginDatabase & NetworkOrigin;

// But the OriginWithSecrets has a partial variant for updates, that is only partial for fields in OriginDatabaseWithSecrets -- we always require a full NetworkOriginWithSecrets
export type OriginWithSecrets = OriginDatabaseWithSecrets &
	NetworkOriginWithSecrets;
export type OriginWithSecretsPartial =
	| (Partial<OriginDatabaseWithSecrets> & NetworkOriginWithSecrets)
	| Partial<OriginDatabaseWithSecrets>;

export type CachingOptions = {
	disabled?: boolean;
	max_age?: number;
	stale_while_revalidate?: number;
};

export type CreateUpdateHyperdriveBody = {
	name: string;
	origin: OriginWithSecrets;
	caching?: CachingOptions;
	mtls?: Mtls;
	origin_connection_limit?: number;
};

export type PatchHyperdriveBody = {
	name?: string;
	origin?: OriginWithSecretsPartial;
	caching?: CachingOptions;
	mtls?: Mtls;
	origin_connection_limit?: number;
};

export type Mtls = {
	ca_certificate_id?: string;
	mtls_certificate_id?: string;
	sslmode?: string;
};

export const Sslmode = ["require", "verify-ca", "verify-full"];

export async function createConfig(
	config: Config,
	body: CreateUpdateHyperdriveBody
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/hyperdrive/configs`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}

export async function deleteConfig(config: Config, id: string): Promise<void> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/hyperdrive/configs/${id}`,
		{
			method: "DELETE",
		}
	);
}

export async function getConfig(
	config: Config,
	id: string
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/hyperdrive/configs/${id}`,
		{
			method: "GET",
		}
	);
}

export async function listConfigs(config: Config): Promise<HyperdriveConfig[]> {
	const accountId = await requireAuth(config);
	return await fetchPagedListResult(
		config,
		`/accounts/${accountId}/hyperdrive/configs`,
		{
			method: "GET",
		}
	);
}

export async function patchConfig(
	config: Config,
	id: string,
	body: PatchHyperdriveBody
): Promise<HyperdriveConfig> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/hyperdrive/configs/${id}`,
		{
			method: "PATCH",
			body: JSON.stringify(body),
		}
	);
}
