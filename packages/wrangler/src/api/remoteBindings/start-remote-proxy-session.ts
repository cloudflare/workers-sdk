import path from "node:path";
import getPort from "get-port";
import { DeferredPromise } from "miniflare";
import remoteBindingsWorkerPath from "worker:remoteBindings/ProxyServerWorker";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
import type { LoggerLevel } from "../../logger";
import type { StartDevWorkerInput, Worker } from "../startDevWorker";
import type { Config } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	// Transform all bindings to use "raw" mode
	const rawBindings = Object.fromEntries(
		Object.entries(bindings ?? {}).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);

	const proxyServerWorkerWranglerConfig = path.resolve(
		getBasePath(),
		"templates/remoteBindings/wrangler.jsonc"
	);

	const worker = await startWorker({
		name: options?.workerName,
		entrypoint: remoteBindingsWorkerPath,
		config: proxyServerWorkerWranglerConfig,
		compatibilityDate: "2025-04-28",
		dev: {
			remote: "minimal",
			auth: options?.auth,
			server: {
				port: await getPort(),
			},
			inspector: false,
			logLevel: getStartWorkerLogLevel(logger.loggerLevel),
		},
		bindings: rawBindings,
	}).catch((startWorkerError) => {
		let errorMessage = startWorkerError;
		if (startWorkerError instanceof Error) {
			if (startWorkerError.cause instanceof Error) {
				errorMessage = startWorkerError.cause.message;
			} else {
				errorMessage = startWorkerError.message;
			}
		}
		throw new Error(
			`Failed to start the remote proxy session, see the error details below:\n\n${errorMessage}`
		);
	});

	const maybeErrorPromise = new DeferredPromise<{ error: unknown }>();

	worker.raw.addListener("error", (e) =>
		maybeErrorPromise.resolve({ error: e })
	);

	const maybeError = await Promise.race([
		maybeErrorPromise,
		worker.raw.proxy.localServerReady.promise,
	]);

	if (maybeError && maybeError.error) {
		throw new Error(
			"Failed to start the remote proxy session. There is likely additional logging output above.",
			{
				cause: maybeError.error,
			}
		);
	}

	const remoteProxyConnectionString =
		(await worker.url) as RemoteProxyConnectionString;

	const updateBindings = async (
		newBindings: StartDevWorkerInput["bindings"]
	) => {
		// Transform all new bindings to use "raw" mode
		const rawNewBindings = Object.fromEntries(
			Object.entries(newBindings ?? {}).map(([key, binding]) => [
				key,
				{ ...binding, raw: true },
			])
		);
		await worker.patchConfig({ bindings: rawNewBindings });
	};

	return {
		ready: worker.ready,
		remoteProxyConnectionString,
		updateBindings,
		dispose: worker.dispose,
	};
}

export type RemoteProxySession = Pick<Worker, "ready" | "dispose"> & {
	updateBindings: (bindings: StartDevWorkerInput["bindings"]) => Promise<void>;
	remoteProxyConnectionString: RemoteProxyConnectionString;
};

/**
 * Gets the log level to use for the remote worker.
 *
 * @param wranglerLogLevel The log level set for the Wrangler process.
 * @returns The log level to use for the remove worker.
 */
function getStartWorkerLogLevel(wranglerLogLevel: LoggerLevel): LoggerLevel {
	switch (wranglerLogLevel) {
		case "debug":
			// If the `logLevel` is "debug" it means that the user is likely trying to debug some issue,
			// so we should respect that here as well for the remote proxy session.
			return "debug";

		case "none":
			// If the `logLevel` is "none" it means that the user is trying to silence all output,
			// so we should respect that here as well for the remote proxy session.
			return "none";

		default:
			// In any other case we want to default to "error" to avoid noisy logs
			return "error";
	}
}
