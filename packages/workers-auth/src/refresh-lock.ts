import { lstatSync } from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import {
	FileLockTimeoutError,
	ProcessOwnerChecker,
	resolveFilePath,
	tryWithFileLock,
	withFileLock,
} from "@cloudflare/workers-utils/file-system";
import { AUTH_REQUEST_TIMEOUT_MS } from "./core/timeouts";
import type { OAuthFlowLogger } from "./context";
import type { FileLockOptions } from "@cloudflare/workers-utils/file-system";

/** Return the same profile-level lock for plaintext and encrypted credentials. */
export function getRefreshLockPath(storagePath: string): string {
	const profilePath = storagePath.replace(/\.(?:toml|json|enc)$/, "");
	for (const extension of ["toml", "json", "enc"]) {
		const sibling = `${profilePath}.${extension}`;
		if (lstatSync(sibling, { throwIfNoEntry: false })?.isSymbolicLink()) {
			return (
				resolveFilePath(sibling).replace(/\.(?:toml|json|enc)$/, "") +
				".refresh-lock"
			);
		}
	}
	return (
		resolveFilePath(storagePath).replace(/\.(?:toml|json|enc)$/, "") +
		".refresh-lock"
	);
}

function releaseOptions(logger?: Pick<OAuthFlowLogger, "debug">) {
	return {
		onReleaseError: () =>
			logger?.debug("Could not remove the credential lock."),
	};
}

/** Attempt a synchronous credential mutation, deferring migration on contention. */
export function tryWithRefreshLock<T>(
	lockDir: string,
	fn: () => T,
	logger?: Pick<OAuthFlowLogger, "debug">,
	owners = new ProcessOwnerChecker()
): { acquired: true; value: T } | { acquired: false } {
	return tryWithFileLock(lockDir, fn, { owners, ...releaseOptions(logger) });
}

/**
 * Serialize credential transactions without allowing a live owner to expire.
 *
 * @param lockDir - Canonical profile-level lock path.
 * @param fn - Credential transaction to execute after acquisition.
 * @param options - Retry, timeout, logger, and ownership settings.
 * @returns The transaction's result.
 */
export async function withRefreshLock<T>(
	lockDir: string,
	fn: () => Promise<T>,
	options?: Pick<
		FileLockOptions,
		"maxRetries" | "retryDelayMs" | "timeoutMs" | "owners"
	> & {
		logger?: Pick<OAuthFlowLogger, "debug">;
	}
): Promise<T> {
	try {
		return await withFileLock(lockDir, fn, {
			...options,
			timeoutMs: options?.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS * 3,
			...releaseOptions(options?.logger),
		});
	} catch (error) {
		if (!(error instanceof FileLockTimeoutError)) {
			throw error;
		}
		throw new UserError(
			"Another process is updating the saved credentials. No credentials were changed. Wait for it to finish and retry the command.",
			{ telemetryMessage: "workers-auth credential lock timeout" }
		);
	}
}
