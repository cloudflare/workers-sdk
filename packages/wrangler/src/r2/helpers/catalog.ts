import { fetchResult } from "../../cfetch";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type R2Warehouse = {
	id: string;
	name: string;
	bucket: string;
	status: "active" | "inactive";
};

/**
 * Retrieve the warehouse for the bucket with the given name
 */
export async function getR2Catalog(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<R2Warehouse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}`,
		{
			method: "GET",
		}
	);
}

type R2WarehouseEnableResponse = {
	id: string;
	name: string;
};

/**
 * Activate the R2 bucket as an Iceberg warehouse
 */
export async function enableR2Catalog(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<R2WarehouseEnableResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/enable`,
		{
			method: "POST",
		}
	);
}

/**
 * Deactivate the R2 bucket as an Iceberg warehouse
 */
export async function disableR2Catalog(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<R2WarehouseEnableResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/disable`,
		{
			method: "POST",
		}
	);
}

type R2CatalogCompactionConfig = {
	state: "enabled" | "disabled";

	// If undefined, the service will set the default value
	targetSizeMb?: number;
};

type R2CatalogCompactionResponse = {
	success: boolean;
};

/**
 * Enable compaction maintenance configuration for a table in the R2 catalog
 */
export async function enableR2CatalogCompaction(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	targetSizeMb: number | undefined
): Promise<R2CatalogCompactionResponse> {
	const config: R2CatalogCompactionConfig = {
		state: "enabled",
		targetSizeMb,
	};

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				compaction: config,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

type R2CatalogSnapshotExpirationConfig = {
	state: "enabled" | "disabled";

	// If undefined, the service will set the default value
	max_snapshot_age?: string;

	// If undefined, the service will set the default value
	min_snapshots_to_keep?: number;
};

type R2CatalogSnapshotExpirationResponse = {
	success: boolean;
};

export async function enableR2CatalogSnapshotExpiration(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	olderThanDays: number | undefined,
	retainLast: number | undefined
): Promise<R2CatalogSnapshotExpirationResponse> {
	const config: R2CatalogSnapshotExpirationConfig = {
		state: "enabled",
		max_snapshot_age: `${olderThanDays ?? 30}d`,
		min_snapshots_to_keep: retainLast ?? 5,
	};

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				snapshot_expiration: config,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

/**
 * Disable compaction maintenance configuration for a table in the R2 catalog
 */
export async function disableR2CatalogCompaction(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<R2CatalogCompactionResponse> {
	const config: R2CatalogCompactionConfig = {
		state: "disabled",
	};

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				compaction: config,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

export async function disableR2CatalogSnapshotExpiration(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string
): Promise<R2CatalogSnapshotExpirationResponse> {
	const config: R2CatalogSnapshotExpirationConfig = {
		state: "disabled",
	};

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				snapshot_expiration: config,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

type R2CatalogCredentialResponse = {
	success: boolean;
};

/**
 * Sets a Cloudflare token which R2 Data Catalog uses for async table maintenance
 * jobs (such as file compaction), where it needs direct access to the customer's R2 bucket.
 */
export async function upsertR2CatalogCredential(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	token: string
): Promise<R2CatalogCredentialResponse> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/credential`,
		{
			method: "POST",
			body: JSON.stringify({
				token,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

/**
 * Enable compaction for a specific table in the R2 catalog
 */
export async function enableR2CatalogTableCompaction(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	namespace: string,
	tableName: string,
	targetSizeMb?: number
): Promise<void> {
	const body: {
		compaction: {
			state: string;
			target_size_mb?: number;
		};
	} = {
		compaction: {
			state: "enabled",
		},
	};

	if (targetSizeMb !== undefined) {
		body.compaction.target_size_mb = targetSizeMb;
	}

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/namespaces/${namespace}/tables/${tableName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify(body),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

/**
 * Disable compaction for a specific table in the R2 catalog
 */
export async function disableR2CatalogTableCompaction(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	namespace: string,
	tableName: string
): Promise<void> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/namespaces/${namespace}/tables/${tableName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				compaction: {
					state: "disabled",
				},
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

export async function enableR2CatalogTableSnapshotExpiration(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	namespace: string,
	tableName: string,
	olderThanDays?: number,
	retainLast?: number
): Promise<void> {
	const body: {
		snapshot_expiration: {
			state: string;
			older_than_days: number;
			retain_last: number;
		};
	} = {
		snapshot_expiration: {
			state: "enabled",
			older_than_days: olderThanDays ?? 30,
			retain_last: retainLast ?? 5,
		},
	};

	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/namespaces/${namespace}/tables/${tableName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify(body),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

export async function disableR2CatalogTableSnapshotExpiration(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	namespace: string,
	tableName: string
): Promise<void> {
	return await fetchResult(
		complianceConfig,
		`/accounts/${accountId}/r2-catalog/${bucketName}/namespaces/${namespace}/tables/${tableName}/maintenance-configs`,
		{
			method: "POST",
			body: JSON.stringify({
				snapshot_expiration: {
					state: "disabled",
				},
			}),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}
