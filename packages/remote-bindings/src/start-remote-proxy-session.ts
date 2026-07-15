import { randomUUID } from "node:crypto";
import events from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { DeferredPromise } from "miniflare";
import { initLogger } from "./logger";
import { startWorker } from "./start-worker";
import type { RemoteBindingsLogger } from "./logger";
import type { Worker } from "./start-worker";
import type {
	Config,
	LoggerLevel,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

type ErrorEvent = {
	type: "error";
	reason: string;
	cause: unknown;
};

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	logger?: RemoteBindingsLogger;
};

function isErrorEvent(error: unknown): error is ErrorEvent {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		error.type === "error" &&
		"reason" in error &&
		"cause" in error
	);
}

function getErrorMessage(error: unknown): string | undefined {
	if (error instanceof Error) {
		return getErrorMessage(error.cause) ?? error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	if (typeof error === "object" && error !== null) {
		const maybeMessage = (error as { message?: unknown }).message;
		if (typeof maybeMessage === "string") {
			const maybeCause = (error as { cause?: unknown }).cause;
			return getErrorMessage(maybeCause) ?? maybeMessage;
		}
	}
	return undefined;
}

function formatRemoteProxySessionError(error: unknown): string | undefined {
	if (isErrorEvent(error)) {
		const causeMessage = getErrorMessage(error.cause);
		return causeMessage ? `${error.reason}: ${causeMessage}` : error.reason;
	}
	return getErrorMessage(error);
}

export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options?: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	if (options?.logger) {
		initLogger(options.logger);
	}
	options?.logger?.log(chalk.dim("⎔ Establishing remote connection..."));
	const rawBindings = toRawBindings(bindings);
	const remoteBindingsWorkerPath = fileURLToPath(
		new URL("./proxy-worker.js", import.meta.url)
	);
	const moduleRoot = path.dirname(remoteBindingsWorkerPath);
	const workerConfig = {
		name: options?.workerName ?? randomUUID(),
		entrypoint: remoteBindingsWorkerPath,
		projectRoot: moduleRoot,
		compatibilityDate: "2025-04-28",
		compatibilityFlags: [],
		complianceRegion: options?.complianceRegion,
		bindings: rawBindings,
		triggers: [],
		build: {
			bundle: false,
			additionalModules: [],
			processEntrypoint: false,
			findAdditionalModules: false,
			moduleRoot,
			moduleRules: [],
			define: {},
			format: "modules" as const,
			nodejsCompatMode: null,
			exports: [],
		},
		legacy: {},
		dev: {
			remote: "minimal" as const,
			auth: options?.auth,
			server: { port: 0, secure: false },
			inspector: false as const,
			logLevel: getStartWorkerLogLevel(options?.logger?.loggerLevel ?? "error"),
			persist: false as const,
			origin: {},
			liveReload: false,
		},
	};

	const worker = await startWorker(workerConfig).catch(
		(startWorkerError: unknown) => {
			if (startWorkerError instanceof UserError) {
				throw startWorkerError;
			}
			let errorMessage = startWorkerError;
			if (startWorkerError instanceof Error) {
				errorMessage =
					startWorkerError.cause instanceof Error
						? startWorkerError.cause.message
						: startWorkerError.message;
			}
			throw new Error(
				`Failed to start the remote proxy session, see the error details below:\n\n${errorMessage}`
			);
		}
	);

	const maybeErrorPromise = new DeferredPromise<{ error: unknown }>();
	worker.raw.addListener("error", (error) => {
		maybeErrorPromise.resolve({ error });
	});
	const maybeError = await Promise.race([
		maybeErrorPromise,
		worker.raw.proxy.localServerReady.promise,
	]);

	if (maybeError && maybeError.error) {
		const details = formatRemoteProxySessionError(maybeError.error);
		throw new Error(
			details
				? `Failed to start the remote proxy session. ${details}`
				: "Failed to start the remote proxy session. There is likely additional logging output above.",
			{ cause: maybeError.error }
		);
	}

	const remoteProxyConnectionString =
		(await worker.url) as RemoteProxyConnectionString;
	const updateBindings = async (
		newBindings: StartDevWorkerInput["bindings"]
	) => {
		const reloadComplete = events.once(worker.raw, "reloadComplete");
		await worker.patchConfig({
			...workerConfig,
			bindings: toRawBindings(newBindings),
		});
		try {
			await reloadComplete;
		} catch (errorOrEvent) {
			throw errorOrEvent instanceof Error
				? errorOrEvent
				: new Error(
						`RemoteProxySession.updateBindings failed during reload: ${
							(errorOrEvent as { reason?: string })?.reason ?? "unknown"
						}`,
						{ cause: errorOrEvent }
					);
		}
		await worker.raw.proxy.runtimeMessageMutex.drained();
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

function toRawBindings(bindings: StartDevWorkerInput["bindings"]) {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);
}

function getStartWorkerLogLevel(wranglerLogLevel: LoggerLevel): LoggerLevel {
	switch (wranglerLogLevel) {
		case "debug":
			return "debug";
		case "none":
			return "none";
		default:
			return "error";
	}
}
