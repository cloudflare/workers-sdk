import fs from "node:fs";
import path from "node:path";
import {
	getTelemetryDataCatalogWorkerURL,
	parsePackageJSON,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { getMetricsConfig } from "../metrics/metrics-config";
import { sniffUserAgent } from "../package-manager";
import { getInstalledPackageVersion } from "../utils/packages";
import type { Binding, StartDevWorkerInput } from "../api";

type TelemetryDataCatalogEntryBase = {
	/** Schema version for the data entry (this is for allowing us to change the structure later on without breaking anything) */
	version: "1";
	/** Type of telemetry data */
	type: string;
};

/**
 * Deployment data to send to the Telemetry Data Catalog worker
 */
type DeploymentDataForTelemetryDataCatalog = TelemetryDataCatalogEntryBase & {
	type: "deployment";
	/** Cloudflare account ID */
	accountId: string;
	/** Worker script name */
	workerName: string;
	/** Version of wrangler */
	wranglerVersion: string;
	/** Package manager used (pnpm, npm, yarn, or bun). `undefined` if the package manager detection fails */
	packageManager?: "npm" | "pnpm" | "yarn" | "bun";
	/** ISO timestamp of deploy */
	deployedAt: string;
	/** Object mapping every binding type to the number of such bindings defined for the current worker */
	bindingsCount: Record<Binding["type"], number>;
	/** The dependencies for the project, `undefined` if the dependencies detection fails */
	projectDependencies?: Record<
		string,
		{
			/** The version specifier from the package.json */
			packageJsonVersion: string;
			/** The actual installed version, `undefined` if the installed version detection fails */
			installedVersion?: string;
		}
	>;
};

/**
 * Sends deployment data regarding the current project to the telemetry data catalog worker.
 *
 * Note: If this function fails to send the data, it logs a debug message without throwing an error.
 *
 * @param options.accountId The Cloudflare account ID
 * @param options.workerName The Worker's name
 * @param options.projectPath Path for the project (where their package.json should be)
 * @param options.bindings The bindings configured for the project
 * @param options.sendMetrics Optional override for telemetry settings (from config.send_metrics)
 */
export async function sendDeploymentToTelemetryDataCatalog({
	accountId,
	workerName,
	projectPath,
	bindings,
	sendMetrics,
}: {
	accountId: string;
	workerName: string;
	projectPath: string;
	bindings: NonNullable<StartDevWorkerInput["bindings"]>;
	sendMetrics?: boolean;
}): Promise<void> {
	const metricsConfig = getMetricsConfig({ sendMetrics });
	if (!metricsConfig.enabled) {
		return;
	}

	const dataCatalogWorkerURL = getTelemetryDataCatalogWorkerURL();
	if (!dataCatalogWorkerURL) {
		// If telemetry data catalog URL is empty do nothing
		return;
	}

	const projectDependencies = getProjectDependencies(projectPath);

	const bindingsCount = getBindingsCount(bindings);

	const deploymentData: DeploymentDataForTelemetryDataCatalog = {
		type: "deployment",
		version: "1",
		accountId,
		workerName,
		wranglerVersion,
		packageManager: sniffUserAgent(),
		deployedAt: new Date().toISOString(),
		projectDependencies,
		bindingsCount,
	};

	try {
		await fetch(dataCatalogWorkerURL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(deploymentData),
		});
	} catch (err) {
		logger.debug(
			"Error sending deployment data to telemetry data catalog",
			err
		);
	}
}

/**
 * Gets the dependencies for the target project
 *
 * @param projectPath Path for the project (where their package.json should be)
 * @returns the project dependencies if successfully detected, `undefined` otherwise
 */
function getProjectDependencies(
	projectPath: string
): DeploymentDataForTelemetryDataCatalog["projectDependencies"] | undefined {
	const packageJsonPath = path.join(projectPath, "package.json");

	if (fs.existsSync(packageJsonPath)) {
		try {
			const projectDependencies: DeploymentDataForTelemetryDataCatalog["projectDependencies"] =
				{};
			const content = fs.readFileSync(packageJsonPath, "utf-8");
			const packageJson = parsePackageJSON(content, packageJsonPath);

			for (const [dependency, packageJsonVersion] of Object.entries(
				packageJson.dependencies ?? {}
			)) {
				projectDependencies[dependency] = {
					packageJsonVersion,
					installedVersion: getInstalledPackageVersion(
						dependency,
						path.dirname(packageJsonPath)
					),
				};
			}

			return projectDependencies;
		} catch {
			// Silently ignore parse errors - package.json may be malformed
			return undefined;
		}
	}
}

/**
 * Given an object containing the worker's bindings returns an object that maps every binding type to
 * the number of occurrences of such bindings
 *
 * @param bindings The target bindings
 * @returns Object containing the bindings counts
 */
function getBindingsCount(
	bindings: NonNullable<StartDevWorkerInput["bindings"]>
): Record<Binding["type"], number> {
	const bindingsCount: Record<Binding["type"], number> = {
		service: 0,
		pipeline: 0,
		plain_text: 0,
		secret_text: 0,
		json: 0,
		kv_namespace: 0,
		send_email: 0,
		wasm_module: 0,
		text_blob: 0,
		browser: 0,
		ai: 0,
		images: 0,
		version_metadata: 0,
		data_blob: 0,
		durable_object_namespace: 0,
		workflow: 0,
		queue: 0,
		r2_bucket: 0,
		d1: 0,
		vectorize: 0,
		hyperdrive: 0,
		fetcher: 0,
		analytics_engine: 0,
		dispatch_namespace: 0,
		mtls_certificate: 0,
		secrets_store_secret: 0,
		logfwdr: 0,
		ratelimit: 0,
		worker_loader: 0,
		vpc_service: 0,
		media: 0,
		assets: 0,
		inherit: 0,
	};
	for (const { type: bindingType } of Object.values(bindings)) {
		bindingsCount[bindingType]++;
	}
	return bindingsCount;
}
