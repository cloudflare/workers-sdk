import { Log, LogLevel } from "miniflare";
import type { DevLogger } from "./logger";
import type { NpmVersionCheckResult } from "@cloudflare/workers-utils";
import type { WorkerdStructuredLog } from "miniflare";

/** The log levels that both Vite and Rsbuild support. */
type BundlerLogLevel = "error" | "warn" | "info" | "silent";

interface UpdateCheck {
	packageName: string;
	checkForNpmUpdate: () => Promise<NpmVersionCheckResult>;
}

/**
 * A Miniflare logger that forwards messages onto a bundler's logger.
 */
export class DevMiniflareLogger extends Log {
	#warnedCompatibilityDateFallback = false;

	private logger: DevLogger;
	private updateCheck: UpdateCheck | undefined;

	/**
	 * @param logger The bundler's logger
	 * @param logLevel The bundler's log level
	 * @param updateCheck Used to suggest upgrading the plugin when workerd doesn't support the requested compatibility date
	 */
	constructor(
		logger: DevLogger,
		logLevel: BundlerLogLevel | undefined,
		updateCheck?: UpdateCheck
	) {
		super(getMiniflareLogLevel(logLevel));
		this.logger = logger;
		this.updateCheck = updateCheck;
	}

	override logWithLevel(level: LogLevel, message: string) {
		switch (level) {
			case LogLevel.ERROR:
				return this.logger.error(message);
			case LogLevel.WARN:
				return this.logger.warn(message);
			case LogLevel.INFO:
				return this.logger.info(message);
		}
	}

	override warn(message: string): void {
		// workerd emits a warning when the requested compatibility date is newer
		// than the binary supports. We intercept it here so we only show it once
		// and only when a newer version of the plugin is actually available on
		// npm — otherwise the warning is just noise the user cannot act on.
		if (!message.startsWith("The latest compatibility date supported by")) {
			this.logger.warn(message);
			return;
		}

		if (this.#warnedCompatibilityDateFallback || !this.updateCheck) {
			return;
		}
		this.#warnedCompatibilityDateFallback = true;

		const { packageName, checkForNpmUpdate } = this.updateCheck;
		return void checkForNpmUpdate().then((result) => {
			if (result.status !== "update-available") {
				return;
			}
			this.logger.warn(
				`${message}\nFeatures enabled by your requested compatibility date may not be available.` +
					`\nUpgrade to \`${packageName}@${result.latest}\` to remove this warning.`
			);
			return;
		});
	}

	override logReady() {
		// Noop so that Miniflare server start messages are not logged
	}
}

function getMiniflareLogLevel(level: BundlerLogLevel = "info"): LogLevel {
	switch (level) {
		case "error":
			return LogLevel.ERROR;
		case "warn":
			return LogLevel.WARN;
		case "info":
			return LogLevel.INFO;
		case "silent":
			return LogLevel.NONE;
	}
}

/**
 * Generates a log handler to be passed as the `handleStructuredLogs` option to miniflare
 *
 * @param logger the Miniflare logger to use
 * @returns the log handler to pass to miniflare
 */
export function getStructuredLogsLogger(logger: Log) {
	return ({ level, message }: WorkerdStructuredLog) => {
		if (level === "warn") {
			return logger.warn(message);
		}

		if (level === "error") {
			return logger.logWithLevel(LogLevel.ERROR, message);
		}

		return logger.info(message);
	};
}
