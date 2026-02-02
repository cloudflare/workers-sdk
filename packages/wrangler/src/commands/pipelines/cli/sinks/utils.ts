import { logger } from "../../../../logger";
import formatLabelledValues from "../../../../utils/render-labelled-values";
import { SINK_DEFAULTS } from "../../defaults";
import type { Sink } from "../../types";

export function displaySinkConfiguration(
	sink: Sink,
	title: string = "Configuration",
	options: { includeTimestamps?: boolean } = {}
) {
	const { includeTimestamps = true } = options;

	if (title) {
		logger.log(`\n${title}:`);
	}

	const general: Record<string, string> = {
		Type: sink.type === "r2" ? "R2" : "R2 Data Catalog",
	};

	if (includeTimestamps) {
		if (sink.created_at) {
			general["Created At"] = new Date(sink.created_at).toLocaleString();
		}
		if (sink.modified_at) {
			general["Modified At"] = new Date(sink.modified_at).toLocaleString();
		}
	}

	const destination: Record<string, string> = {
		Bucket: sink.config.bucket,
	};

	if (sink.type === "r2") {
		destination.Path = sink.config.path || "(root)";
		destination.Partitioning =
			sink.config.partitioning?.time_pattern ||
			SINK_DEFAULTS.r2.partitioning.time_pattern;
	}

	if (
		sink.type === "r2_data_catalog" &&
		sink.config.namespace &&
		sink.config.table_name
	) {
		destination.Table = `${sink.config.namespace}.${sink.config.table_name}`;
	}

	const fileSizeBytes =
		sink.config.rolling_policy?.file_size_bytes ??
		SINK_DEFAULTS.rolling_policy.file_size_bytes;
	const intervalSeconds =
		sink.config.rolling_policy?.interval_seconds ??
		SINK_DEFAULTS.rolling_policy.interval_seconds;

	const batching: Record<string, string> = {
		"File Size":
			fileSizeBytes === undefined || fileSizeBytes === 0
				? "none"
				: `${Math.round(fileSizeBytes / (1024 * 1024))}MB`,
		"Time Interval": `${intervalSeconds}s`,
	};

	const format: Record<string, string> = {
		Type: sink.format.type,
	};

	// Only show compression and row group size for parquet (JSON doesn't support these)
	if (sink.format.type === "parquet") {
		const defaultParquet =
			SINK_DEFAULTS.format.type === "parquet" ? SINK_DEFAULTS.format : null;
		if (defaultParquet) {
			const compression = sink.format.compression || defaultParquet.compression;
			if (compression) {
				format.Compression = compression;
			}
			const rowGroupBytes =
				sink.format.row_group_bytes ?? defaultParquet.row_group_bytes;
			if (rowGroupBytes !== undefined) {
				format["Target Row Group Size"] =
					`${Math.round(rowGroupBytes / (1024 * 1024))}MB`;
			}
		} else {
			if (sink.format.compression) {
				format.Compression = sink.format.compression;
			}
			if (sink.format.row_group_bytes !== undefined) {
				format["Target Row Group Size"] =
					`${Math.round(sink.format.row_group_bytes / (1024 * 1024))}MB`;
			}
		}
	}

	logger.log("General:");
	logger.log(formatLabelledValues(general, { indentationCount: 2 }));

	logger.log("\nDestination:");
	logger.log(formatLabelledValues(destination, { indentationCount: 2 }));

	logger.log("\nBatching:");
	logger.log(formatLabelledValues(batching, { indentationCount: 2 }));

	logger.log("\nFormat:");
	logger.log(formatLabelledValues(format, { indentationCount: 2 }));
}
