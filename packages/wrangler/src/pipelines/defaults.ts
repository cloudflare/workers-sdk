import type { ParquetFormat, Sink } from "./types";

export const SINK_DEFAULTS = {
	format: {
		type: "parquet",
		compression: "zstd",
		row_group_bytes: 1024 * 1024 * 1024,
	} as ParquetFormat,
	rolling_policy: {
		file_size_bytes: 0,
		interval_seconds: 30,
	},
	r2: {
		path: "",
		partitioning: {
			time_pattern: "year=%Y/month=%m/day=%d",
		},
	},
	r2_data_catalog: {},
} as const;

export function applyDefaultsToSink(sink: Sink): Sink {
	const withDefaults: Sink = {
		...sink,
		format: { ...sink.format },
		config: { ...sink.config },
	};

	if (withDefaults.format.type === "parquet") {
		if (!withDefaults.format.compression) {
			withDefaults.format.compression = SINK_DEFAULTS.format.compression;
		}
		if (!withDefaults.format.row_group_bytes) {
			withDefaults.format.row_group_bytes =
				SINK_DEFAULTS.format.row_group_bytes;
		}
	}

	if (!withDefaults.config.rolling_policy) {
		withDefaults.config.rolling_policy = {
			file_size_bytes: SINK_DEFAULTS.rolling_policy.file_size_bytes,
			interval_seconds: SINK_DEFAULTS.rolling_policy.interval_seconds,
		};
	} else {
		if (!withDefaults.config.rolling_policy.file_size_bytes) {
			withDefaults.config.rolling_policy.file_size_bytes =
				SINK_DEFAULTS.rolling_policy.file_size_bytes;
		}
		if (!withDefaults.config.rolling_policy.interval_seconds) {
			withDefaults.config.rolling_policy.interval_seconds =
				SINK_DEFAULTS.rolling_policy.interval_seconds;
		}
	}

	if (withDefaults.type === "r2") {
		if (!withDefaults.config.path) {
			withDefaults.config.path = SINK_DEFAULTS.r2.path;
		}
		if (!withDefaults.config.partitioning) {
			withDefaults.config.partitioning = SINK_DEFAULTS.r2.partitioning;
		}
	}

	return withDefaults;
}
