export type Database = {
	uuid: string;
	previewDatabaseUuid?: string;
	name: string;
	binding: string;
	internal_env?: string;
	migrationsTableName: string;
	migrationsFolderPath: string;
};

export type DatabaseCreationResult = {
	uuid: string;
	name: string;
	primary_location_hint?: string;
	created_in_region?: string;
};

export type DatabaseInfo = {
	uuid: string;
	name: string;
	version: "alpha" | "beta";
	num_tables: number;
	file_size: number;
	running_in_region?: string;
};

export type Backup = {
	id: string;
	database_id: string;
	created_at: string;
	state: "progress" | "done";
	num_tables: number;
	file_size: number;
	size?: string;
};

export type Migration = {
	id: string;
	name: string;
	applied_at: string;
};

export interface D1Metrics {
	sum?: {
		readQueries?: number;
		writeQueries?: number;
		queryBatchResponseBytes?: number;
	};
	quantiles?: {
		queryBatchTimeMsP90?: number;
	};
	avg?: {
		queryBatchTimeMs?: number;
	};
	dimensions: {
		databaseId?: string;
		date?: string;
		datetime?: string;
		datetimeMinute?: string;
		datetimeFiveMinutes?: string;
		datetimeFifteenMinutes?: string;
		datetimeHour?: string;
	};
}

export interface D1MetricsGraphQLResponse {
	data: {
		viewer: {
			accounts: { d1AnalyticsAdaptiveGroups?: D1Metrics[] }[];
		};
	};
}
