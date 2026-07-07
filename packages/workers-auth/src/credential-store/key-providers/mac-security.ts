import { spawnSync } from "node:child_process";
import {
	decodeKeyEnvelope,
	encodeKeyEnvelope,
	getKeyringAccountName,
} from "./shared";
import type { KeyProvider } from "./interface";
import type { SpawnSyncReturns } from "node:child_process";

/**
 * Exit code returned by `/usr/bin/security` when a generic-password item is
 * not found. Treated as "no key stored" rather than an error so the
 * higher-level `KeyProvider` API can match the file-store semantics:
 * `getKey()` → undefined, `deleteKey()` → no-op.
 *
 * Source: `man security` — "errSecItemNotFound = -25300" surfaces to the
 * shell as exit code 44 from `find-generic-password` and
 * `delete-generic-password`.
 */
const SECURITY_EXIT_ITEM_NOT_FOUND = 44;

/** Signature of the `/usr/bin/security` invoker. Overridable for tests. */
export type MacSecurityCommandRunner = (
	args: string[],
	options?: { input?: string }
) => SpawnSyncReturns<string>;

function defaultRunner(
	args: string[],
	options: { input?: string } = {}
): SpawnSyncReturns<string> {
	return spawnSync("/usr/bin/security", args, {
		encoding: "utf-8",
		input: options.input,
	});
}

let runner: MacSecurityCommandRunner = defaultRunner;

/**
 * Override the `/usr/bin/security` invoker for tests. Pass `undefined` to
 * restore the default real-process runner.
 */
export function setMacSecurityCommandRunner(
	fn: MacSecurityCommandRunner | undefined
): void {
	runner = fn ?? defaultRunner;
}

/**
 * macOS Keychain backend that stores the encryption key for the active
 * {@link EncryptedFileCredentialStore} via the `/usr/bin/security` CLI.
 *
 * The `security` binary is part of every macOS install so this path has
 * zero install cost. The `serviceName` is consumer-provided so different
 * Cloudflare CLIs (wrangler, future tools) can coexist on the same
 * keychain without colliding.
 *
 * Trade-off: `add-generic-password -w <secret>` puts the secret on the
 * argv of a short-lived subprocess, briefly visible to other processes
 * running as the same user (e.g. via `ps`). This is the same trade-off
 * accepted by `git credential-osxkeychain`. Because the secret here is
 * only the 32-byte encryption key (not the OAuth tokens themselves), the
 * exposure window is narrower than the previous direct-keyring design.
 */
export class MacSecurityKeyProvider implements KeyProvider {
	constructor(
		private readonly serviceName: string,
		private readonly profile?: string
	) {}

	getKey(): Uint8Array | undefined {
		const r = runner([
			"find-generic-password",
			"-s",
			this.serviceName,
			"-a",
			getKeyringAccountName(this.profile),
			"-w",
		]);
		if (r.status === SECURITY_EXIT_ITEM_NOT_FOUND) {
			return undefined;
		}
		if (r.status !== 0) {
			throw new Error(
				`Failed to read key from macOS Keychain (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
			);
		}
		return decodeKeyEnvelope(r.stdout.trim());
	}

	setKey(key: Uint8Array): void {
		const r = runner([
			"add-generic-password",
			"-s",
			this.serviceName,
			"-a",
			getKeyringAccountName(this.profile),
			"-w",
			encodeKeyEnvelope(key),
			"-U",
		]);
		if (r.status !== 0) {
			throw new Error(
				`Failed to write key to macOS Keychain (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
			);
		}
	}

	deleteKey(): void {
		const r = runner([
			"delete-generic-password",
			"-s",
			this.serviceName,
			"-a",
			getKeyringAccountName(this.profile),
		]);
		if (r.status === 0 || r.status === SECURITY_EXIT_ITEM_NOT_FOUND) {
			return;
		}
		throw new Error(
			`Failed to delete key from macOS Keychain (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
		);
	}

	describe(): string {
		return `macOS Keychain (service=${this.serviceName}, account=${getKeyringAccountName(this.profile)})`;
	}
}
