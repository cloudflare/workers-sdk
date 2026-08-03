import { spawnSync } from "node:child_process";
import {
	decodeKeyEnvelope,
	encodeKeyEnvelope,
	getKeyringAccountName,
} from "./shared";
import type { KeyProvider } from "./interface";
import type { SpawnSyncReturns } from "node:child_process";

/** Signature of the `secret-tool` invoker. Overridable for tests. */
export type LinuxSecretToolRunner = (
	args: string[],
	options?: { input?: string }
) => SpawnSyncReturns<string>;

function defaultRunner(
	args: string[],
	options: { input?: string } = {}
): SpawnSyncReturns<string> {
	return spawnSync("secret-tool", args, {
		encoding: "utf-8",
		input: options.input,
	});
}

let runner: LinuxSecretToolRunner = defaultRunner;

/**
 * Cached `probeSecretTool` result. The resolver re-runs the resolution
 * on every credential read/write so the probe would otherwise spawn
 * `secret-tool --version` on every operation. Memoizing per-process
 * keeps the probe out of the hot path. `undefined` means "not yet
 * probed".
 *
 * Reset by {@link setLinuxSecretToolRunner} so tests that swap the
 * runner mid-suite re-probe with the new fake.
 */
let cachedProbeResult: boolean | undefined = undefined;

/**
 * Override the `secret-tool` invoker for tests. Pass `undefined` to restore
 * the default real-process runner. Resets the memoized
 * {@link probeSecretTool} result so the next call re-probes through the
 * new runner.
 */
export function setLinuxSecretToolRunner(
	fn: LinuxSecretToolRunner | undefined
): void {
	runner = fn ?? defaultRunner;
	cachedProbeResult = undefined;
}

/**
 * Probe whether `secret-tool` is callable in the current environment.
 *
 * Returns `true` when `secret-tool --version` exits 0. The probe does not
 * exercise the keyring backend itself — a missing D-Bus session surfaces
 * on the first real read/write rather than every consumer invocation, so
 * we avoid the extra latency on every command for users whose desktop
 * session is fully working.
 *
 * The result is memoized per-process: `secret-tool` is not going to be
 * uninstalled mid-command, and the resolver re-resolves the active store
 * on every credential operation (see `resolver.ts`), so caching keeps the
 * probe off the hot path. Tests reset the cache via
 * {@link setLinuxSecretToolRunner}.
 */
export function probeSecretTool(): boolean {
	if (cachedProbeResult !== undefined) {
		return cachedProbeResult;
	}
	let result: boolean;
	try {
		const r = runner(["--version"]);
		result = r.status === 0;
	} catch {
		result = false;
	}
	cachedProbeResult = result;
	return result;
}

/**
 * Linux backend that stores the encryption key via libsecret's
 * `secret-tool` CLI.
 *
 * The key is passed to `secret-tool store` via stdin so it never appears
 * on the subprocess argv. Lookup writes the key envelope to stdout, which
 * is captured by `spawnSync`.
 *
 * `secret-tool` is part of the `libsecret-tools` package on most Linux
 * distros. The resolver in {@link "../resolver"} probes for its presence
 * and surfaces actionable install hints when missing; this class assumes
 * the tool is available.
 */
export class LinuxSecretToolKeyProvider implements KeyProvider {
	constructor(
		private readonly serviceName: string,
		private readonly profile?: string
	) {}

	getKey(): Uint8Array | undefined {
		const r = runner([
			"lookup",
			"service",
			this.serviceName,
			"account",
			getKeyringAccountName(this.profile),
		]);
		// `secret-tool lookup` exits 1 when no matching item is found.
		if (r.status === 1) {
			return undefined;
		}
		if (r.status !== 0) {
			throw new Error(
				`Failed to read key via secret-tool (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
			);
		}
		// `.trim()` matches `MacSecurityKeyProvider.getKey()`: `secret-tool
		// lookup` ends its output with a newline, which `JSON.parse` happens
		// to accept, but trimming first is defensive (and keeps the two
		// providers behaviourally identical).
		return decodeKeyEnvelope(r.stdout.trim());
	}

	setKey(key: Uint8Array): void {
		const r = runner(
			[
				"store",
				"--label=Cloudflare credentials key",
				"service",
				this.serviceName,
				"account",
				getKeyringAccountName(this.profile),
			],
			{ input: encodeKeyEnvelope(key) }
		);
		if (r.status !== 0) {
			throw new Error(
				`Failed to write key via secret-tool (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
			);
		}
	}

	deleteKey(): void {
		const r = runner([
			"clear",
			"service",
			this.serviceName,
			"account",
			getKeyringAccountName(this.profile),
		]);
		// `secret-tool clear` is idempotent: exit 0 whether the item existed
		// or not. Any non-zero exit indicates a real failure (no D-Bus
		// session, locked keyring, etc.).
		if (r.status !== 0) {
			throw new Error(
				`Failed to delete key via secret-tool (exit ${r.status}): ${r.stderr?.trim() ?? "(no stderr)"}`
			);
		}
	}

	describe(): string {
		return `Linux secret-tool (service=${this.serviceName}, account=${getKeyringAccountName(this.profile)})`;
	}
}
