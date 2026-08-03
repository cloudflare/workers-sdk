/** Database info, possibly translated from wrangler configs with bits missing */
export type Database = {
	uuid?: string;
	previewDatabaseUuid?: string;
	name?: string;
	binding: string;
	internal_env?: string;
	migrationsTableName: string;
	/**
	 * The raw `migrations_dir` value the user set in their Wrangler config,
	 * or undefined if they did not set one.
	 */
	migrationsDirRaw?: string;
	/**
	 * Optional glob (relative to the Wrangler config file) for discovering
	 * migration files. When not set, callers should default to
	 * `${migrationsDirRaw ?? DEFAULT_MIGRATION_PATH}/*.sql`.
	 */
	migrationsPattern?: string;
};

/** Most --remote commands need a database with a uuid. This may be fetched from the API */
export type DatabaseWithUuid = Omit<Database, "uuid"> & {
	uuid: string;
};

export function hasUuid(db: Database | null): db is DatabaseWithUuid {
	return !!db?.uuid;
}

/** If we made a request to get database info then we will have both name and uuid */
export type ConcreteDatabase = Omit<Database, "name" | "uuid"> & {
	name: string;
	uuid: string;
};

export function isConcreteDatabase(
	db: Database | null
): db is ConcreteDatabase {
	return !!(db?.name && db?.uuid);
}

export type DatabaseCreationResult = {
	uuid: string;
	name: string;
	primary_location_hint?: string;
	created_in_region?: string;
};

export type DatabaseInfo = {
	uuid: string;
	name: string;
	version: "alpha" | "beta" | "production";
	num_tables: number;
	file_size: number;
	running_in_region?: string;
	read_replication?: {
		mode: "auto" | "disabled";
	};
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
		rowsRead?: number;
		rowsWritten?: number;
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

export interface D1Queries {
	avg?: {
		queryDurationMs?: number;
		rowsRead?: number;
		rowsWritten?: number;
		rowsReturned?: number;
	};
	sum?: {
		queryDurationMs?: number;
		rowsRead?: number;
		rowsWritten?: number;
		rowsReturned?: number;
	};
	count?: number;
	dimensions: {
		query?: string;
		databaseId?: string;
		date?: string;
		datetime?: string;
		datetimeMinute?: string;
		datetimeFiveMinutes?: string;
		datetimeFifteenMinutes?: string;
		datetimeHour?: string;
	};
}

export interface D1QueriesGraphQLResponse {
	data: {
		viewer: {
			accounts: { d1QueriesAdaptiveGroups?: D1Queries[] }[];
		};
	};
}

export type ImportInitResponse = {
	filename: string;
	upload_url: string;
};
export type ImportPollingResponse = {
	success: true;
	type: "import";
	at_bookmark: string;
	messages: string[];
	errors: string[];
} & (
	| {
			status: "active" | "error";
	  }
	| {
			status: "complete";
			result: {
				final_bookmark: string;
				num_queries: number;
				meta: {
					served_by: string;
					duration: number;
					changes: number;
					last_row_id: number;
					changed_db: boolean;
					size_after: number;
					rows_read: number;
					rows_written: number;
				};
			};
	  }
);

export type ExportPollingResponse = {
	success: true;
	type: "export";
	at_bookmark: string;
	messages: string[];
	error: string;
} & (
	| {
			status: "active" | "error";
	  }
	| {
			status: "complete";
			result: { filename: string; signed_url: string };
	  }
);

export type PollingFailure = { success: false; error: string };
