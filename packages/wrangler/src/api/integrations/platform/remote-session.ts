import { fork } from "node:child_process";
import path from "node:path";
import { pickRemoteBindings } from "@cloudflare/remote-bindings";
import {
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import treeKill from "tree-kill";
import { logger } from "../../../logger";
import { getBasePath } from "../../../paths";
import { isCfAuthActive } from "../../../user";
import { convertConfigBindingsToStartWorkerBindings } from "../../startDevWorker/binding-utils";
import { startSession } from "./remote-session-shared";
import type { SessionConfig, StartupMessage } from "./remote-session-shared";
import type { RemoteProxySession } from "@cloudflare/remote-bindings";
import type { Config } from "@cloudflare/workers-utils/config";

type PlatformProxyRemoteSession = Pick<
	RemoteProxySession,
	"remoteProxyConnectionString" | "dispose"
>;

const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Start the configured remote bindings, if any. The caller owns disposal.
 * A Node.js session inherits the environment at proxy creation. If it is lazy,
 * it only resolves credentials on the first binding call.
 */
export async function startPlatformProxyRemoteSession(
	config: Config
): Promise<PlatformProxyRemoteSession | undefined> {
	const bindings = pickRemoteBindings(
		convertConfigBindingsToStartWorkerBindings(config) ?? {}
	);
	if (Object.keys(bindings).length === 0) {
		return;
	}

	const sessionConfig: SessionConfig = {
		bindings,
		workerName: config.name ?? "worker",
		accountId: config.account_id,
		complianceRegion: getCloudflareComplianceRegion(config),
		cliDisplayName: isCfAuthActive() ? "cf" : "Wrangler",
	};
	if (process.versions.bun) {
		return startSession(sessionConfig);
	}
	return startBackgroundSession(sessionConfig);
}

/** Keep the remote session independent of synchronous binding calls, including terminal I/O for OAuth. */
async function startBackgroundSession(
	config: SessionConfig
): Promise<PlatformProxyRemoteSession> {
	const child = fork(
		path.join(
			getBasePath(),
			"wrangler-dist",
			"platform-proxy-remote-session.js"
		),
		{
			execArgv: process.execArgv.filter((arg) =>
				/^--(?:no-)?use-(?:(?:bundled|openssl|system)-ca|env-proxy)(?:=|$)/.test(
					arg.replaceAll("_", "-")
				)
			),
			env: { ...process.env, WRANGLER_LOG: logger.loggerLevel },
			stdio: ["inherit", "inherit", "inherit", "ipc"],
		}
	);
	let ready = false;
	let hasExited = false;
	let disposePromise: Promise<void> | undefined;
	const startup = Promise.withResolvers<StartupMessage>();
	const exited = new Promise<void>((resolve) => {
		child.once("exit", (code, signal) => {
			hasExited = true;
			const status = signal ?? `exit code ${code}`;
			if (!ready) {
				startup.reject(
					new Error(
						`The getPlatformProxy remote session exited before it was ready (${status}).`
					)
				);
			} else if (!disposePromise) {
				logger.warn(
					`The getPlatformProxy remote session exited unexpectedly (${status}).`
				);
			}
			resolve();
		});
		child.on("error", (error) => {
			startup.reject(error);
			if (child.pid === undefined) {
				hasExited = true;
				resolve();
			}
		});
	});
	child.once("message", (message: StartupMessage) => {
		ready = message.type === "ready";
		startup.resolve(message);
	});
	const dispose = () => {
		if (!disposePromise) {
			let forcedShutdown: Promise<void> | undefined;
			const timeout = setTimeout(() => {
				const pid = child.pid;
				if (pid === undefined || hasExited) {
					return;
				}
				forcedShutdown = new Promise<void>((resolve) => {
					treeKill(pid, "SIGKILL", (error) => {
						if (error && !hasExited) {
							logger.warn(
								`Could not terminate the remote session process tree: ${error.message}`
							);
							child.kill("SIGKILL");
						}
						resolve();
					});
				});
			}, SHUTDOWN_GRACE_MS);
			timeout.unref();
			disposePromise = exited.then(() => {
				clearTimeout(timeout);
				return forcedShutdown;
			});
			if (child.connected) {
				child.disconnect();
			}
		}
		return disposePromise;
	};
	try {
		child.send(config, (error) => {
			if (error) {
				startup.reject(error);
			}
		});
		const message = await startup.promise;
		if (message.type === "error") {
			const error = message.userError
				? new UserError(message.message, {
						telemetryMessage: message.telemetryMessage ?? false,
					})
				: new Error(message.message);
			error.stack = message.stack;
			throw error;
		}
		return {
			remoteProxyConnectionString: new URL(
				message.url
			) as RemoteProxySession["remoteProxyConnectionString"],
			dispose,
		};
	} catch (error) {
		await dispose();
		throw error;
	}
}
