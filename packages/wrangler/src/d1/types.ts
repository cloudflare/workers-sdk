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
	};
	sum?: {
		queryDurationMs?: number;
		rowsRead?: number;
		rowsWritten?: number;
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
	success: true;
	filename: string;
	uploadUrl: string;
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
				success: boolean;
				finalBookmark: string;
				numQueries: number;
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
