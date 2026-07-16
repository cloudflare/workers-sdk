import { randomUUID } from "node:crypto";
import events from "node:events";
import { fileURLToPath } from "node:url";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { DeferredPromise } from "miniflare";
import { getRemoteBindingsAuthHook } from "./auth";
import { initLogger } from "./logger";
import { startWorker } from "./start-worker";
import type { RemoteBindingsLogger } from "./logger";
import type {
	AsyncHook,
	CfAccount,
	Config,
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
	auth?: AsyncHook<CfAccount>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	logger: RemoteBindingsLogger;
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
	options: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	initLogger(options.logger);
	options.logger.log(chalk.dim("⎔ Establishing remote connection..."));
	const rawBindings = toRawBindings(bindings);
	const remoteBindingsWorkerPath = fileURLToPath(
		new URL("./proxy-worker.js", import.meta.url)
	);
	const workerConfig = {
		name: options.workerName ?? randomUUID(),
		entrypoint: remoteBindingsWorkerPath,
		compatibilityDate: "2025-04-28",
		compatibilityFlags: [],
		complianceRegion: options.complianceRegion,
		bindings: rawBindings,
		dev: {
			remote: "minimal" as const,
			auth: getRemoteBindingsAuthHook(
				options.auth,
				undefined,
				undefined,
				options.logger
			),
			server: { port: 0, secure: false },
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
	const onStartupError = (error: unknown) => {
		maybeErrorPromise.resolve({ error });
	};
	worker.raw.addListener("error", onStartupError);
	let remoteProxyConnectionString: RemoteProxyConnectionString;
	try {
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

		remoteProxyConnectionString =
			(await worker.url) as RemoteProxyConnectionString;
	} catch (error) {
		await worker.dispose();
		throw error;
	} finally {
		worker.raw.removeListener("error", onStartupError);
	}
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

export type RemoteProxySession = {
	ready: Promise<void>;
	dispose(): Promise<void>;
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
