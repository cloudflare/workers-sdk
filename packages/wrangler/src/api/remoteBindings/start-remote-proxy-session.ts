import events from "node:events";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { DeferredPromise } from "miniflare";
import remoteBindingsWorkerPath from "worker:remoteBindings/ProxyServerWorker";
import { RemoteSessionAuthenticationError } from "../../dev/remote";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
import { startWorker } from "../startDevWorker";
import type { LoggerLevel } from "../../logger";
import type { StartDevWorkerInput, Worker } from "../startDevWorker";
import type { ErrorEvent } from "../startDevWorker/events";
import type { Config } from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: NonNullable<StartDevWorkerInput["dev"]>["auth"];
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
};

function isErrorEvent(error: unknown): error is ErrorEvent {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		(error as { type?: string }).type === "error" &&
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

/**
 * Walks the cause chain of an error (including {@link ErrorEvent} wrappers)
 * looking for a {@link RemoteSessionAuthenticationError}.
 *
 * @param error - the error or ErrorEvent to inspect
 * @returns the first {@link RemoteSessionAuthenticationError} found, or
 *   `undefined` if none exists in the chain
 */
function findRemoteSessionAuthError(
	error: unknown
): RemoteSessionAuthenticationError | undefined {
	if (error instanceof RemoteSessionAuthenticationError) {
		return error;
	}

	if (isErrorEvent(error) || (error instanceof Error && error.cause)) {
		return findRemoteSessionAuthError(error.cause);
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
	logger.log(chalk.dim("⎔ Establishing remote connection..."));
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
				port: 0,
			},
			inspector: false,
			logLevel: getStartWorkerLogLevel(logger.loggerLevel),
		},
		bindings: rawBindings,
	}).catch((startWorkerError) => {
		// If the error is already a UserError (e.g. an auth failure from
		// ConfigController), re-throw it directly so the top-level error
		// handler can display the original, actionable message without
		// wrapping it in a generic "Failed to start" envelope.
		if (startWorkerError instanceof UserError) {
			throw startWorkerError;
		}
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
		const authError = findRemoteSessionAuthError(maybeError.error);
		if (authError) {
			throw authError;
		}

		const details = formatRemoteProxySessionError(maybeError.error);
		throw new Error(
			details
				? `Failed to start the remote proxy session. ${details}`
				: "Failed to start the remote proxy session. There is likely additional logging output above.",
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

		// `worker.patchConfig` returns as soon as the config update is dispatched
		// — long before the remote worker has actually been re-uploaded with the
		// new bindings and the local proxy worker has unpaused. If we returned
		// here, callers issuing requests immediately afterwards would race the
		// reload window, often surfacing as "WebSocket connection failed" for
		// JSRPC bindings.
		//
		// Subscribe BEFORE patchConfig so we don't miss either event.
		// `events.once()` resolves on `reloadComplete` and rejects if `error`
		// is emitted first (with the event payload as the rejection value).
		const reloadComplete = events.once(worker.raw, "reloadComplete");
		await worker.patchConfig({ bindings: rawNewBindings });
		try {
			await reloadComplete;
		} catch (errOrEvent) {
			throw errOrEvent instanceof Error
				? errOrEvent
				: new Error(
						`RemoteProxySession.updateBindings failed during reload: ${
							(errOrEvent as { reason?: string })?.reason ?? "unknown"
						}`,
						{ cause: errOrEvent }
					);
		}
		// The "play" message that resumes the local proxy worker is enqueued on
		// this mutex during onReloadComplete. Wait for it to drain so the proxy
		// actually unpauses before we return — matches what `worker.fetch` does.
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
