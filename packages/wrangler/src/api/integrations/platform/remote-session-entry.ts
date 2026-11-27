import "cloudflare/shims/web";
import { once } from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../../../logger";
import { registerOutputStreamErrorHandler } from "../../../output-stream-errors";
import { configureHttpProxy } from "../../../utils/http-proxy";
import { startSession } from "./remote-session-shared";
import type { SessionConfig, StartupMessage } from "./remote-session-shared";
import type { RemoteProxySession } from "@cloudflare/remote-bindings";

async function sendStartupMessage(message: StartupMessage) {
	const send = process.send?.bind(process);
	if (send && process.connected) {
		await new Promise<void>((resolve, reject) => {
			send(message, (error: Error | null) =>
				error ? reject(error) : resolve()
			);
		});
	}
}

async function runPlatformProxyRemoteSession(): Promise<void> {
	const disconnected = once(process, "disconnect").then(() => undefined);
	const config: SessionConfig | undefined = await Promise.race([
		once(process, "message").then(([message]) => message),
		disconnected,
	]);
	if (!config || !process.connected) {
		return;
	}

	let session: RemoteProxySession | undefined;
	try {
		try {
			session = await startSession(config);
		} catch (error) {
			await sendStartupMessage({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				userError: error instanceof UserError,
				telemetryMessage:
					error instanceof UserError ? error.telemetryMessage : undefined,
			});
			await disconnected;
			return;
		}
		await sendStartupMessage({
			type: "ready",
			url: session.remoteProxyConnectionString.href,
		});
		await disconnected;
	} finally {
		if (process.connected) {
			process.disconnect?.();
		}
		await session?.dispose();
	}
}

if (process.connected) {
	registerOutputStreamErrorHandler(process.stdout);
	registerOutputStreamErrorHandler(process.stderr);
	configureHttpProxy();
	runPlatformProxyRemoteSession().then(
		() => process.exit(0),
		(error) => {
			logger.error(error);
			process.exit(1);
		}
	);
}
