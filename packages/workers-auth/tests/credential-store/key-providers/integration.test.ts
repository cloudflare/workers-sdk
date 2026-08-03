// Integration tests for the keyring `KeyProvider`s that actually shell
// out to the real OS keychain on the test runner.
//
// The mocked unit tests (`mac-security.test.ts`,
// `linux-secret-tool.test.ts`) cover argv shape, exit-code mapping,
// stdin handling, etc. — they swap the `spawnSync` runner with a fake
// so the developer's real keychain is never touched. That gives fast,
// deterministic coverage of the shape of each subprocess call, but it
// does *not* catch:
//   - the actual `security` / `secret-tool` binary changing its
//     argument format on a new OS release
//   - keychain item-storage round-trip bugs (e.g. encoding issues in
//     {@link encodeKeyEnvelope} that only manifest when the OS treats
//     the value as opaque bytes vs. UTF-8)
//   - permission / TCC prompts that the unit tests can't simulate
//
// This file fills that gap by driving the real CLI on the real OS.
// Each platform is gated behind a `describe.skipIf(...)` so the suite
// gracefully no-ops on incompatible runners (Linux CI containers
// without a D-Bus session, Windows runners without the lazy-installed
// `@napi-rs/keyring` binding, etc.).
//
// Hygiene rules:
//   - Use a *unique* service name per test run so we never collide with
//     a real wrangler-managed keychain entry on a developer machine.
//   - Always `afterEach` cleanup — leaving stray keychain entries on a
//     developer's machine is a paper-cut.
//   - Validate round-trip via `getKey() === setKey(...)` so encoding
//     bugs surface immediately.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterEach, describe, it } from "vitest";
import {
	LinuxSecretToolKeyProvider,
	probeSecretTool,
} from "../../../src/credential-store/key-providers/linux-secret-tool";
import { MacSecurityKeyProvider } from "../../../src/credential-store/key-providers/mac-security";
import type { KeyProvider } from "../../../src/credential-store/key-providers/interface";

/**
 * Build a fresh unique service name so concurrent test runs (and any
 * already-present wrangler entry on the developer's keychain) never
 * collide.
 */
function uniqueServiceName(prefix: string): string {
	return `${prefix}-${randomBytes(8).toString("hex")}`;
}

/** A round-trip / delete sequence that every backend should pass. */
function runKeyProviderRoundTripContract(
	makeProvider: () => KeyProvider,
	provider: { current: KeyProvider | undefined }
) {
	it("round-trips a 32-byte key through the real OS keychain", ({ expect }) => {
		provider.current = makeProvider();
		const written = new Uint8Array(randomBytes(32));

		expect(provider.current.getKey()).toBeUndefined();

		provider.current.setKey(written);
		const readBack = provider.current.getKey();
		expect(readBack).toBeDefined();
		expect(Array.from(readBack as Uint8Array)).toEqual(Array.from(written));
	});

	it("setKey is idempotent — second write overwrites the first", ({
		expect,
	}) => {
		provider.current = makeProvider();
		const first = new Uint8Array(randomBytes(32));
		const second = new Uint8Array(randomBytes(32));

		provider.current.setKey(first);
		provider.current.setKey(second);

		const readBack = provider.current.getKey();
		expect(Array.from(readBack as Uint8Array)).toEqual(Array.from(second));
	});

	it("deleteKey clears the entry and is idempotent on the next call", ({
		expect,
	}) => {
		provider.current = makeProvider();
		const written = new Uint8Array(randomBytes(32));
		provider.current.setKey(written);
		expect(provider.current.getKey()).toBeDefined();

		provider.current.deleteKey();
		expect(provider.current.getKey()).toBeUndefined();

		// Second delete must not throw — `KeyProvider.deleteKey()` is
		// documented as idempotent.
		expect(() => (provider.current as KeyProvider).deleteKey()).not.toThrow();
	});
}

/**
 * Probe whether the runner machine can actually exercise the
 * `secret-tool` backend. Requires both the binary AND a D-Bus session
 * (which standard Linux CI containers don't have unless explicitly
 * provisioned). `secret-tool store --help` exits cleanly even without
 * D-Bus, so we go one step further and try a no-op lookup against a
 * service name that's guaranteed not to exist — exit 1 (no match) is
 * the success signal; any other exit (e.g. 256 / no D-Bus) means the
 * backend isn't usable and the suite should skip.
 */
function isSecretToolBackendReachable(): boolean {
	if (process.platform !== "linux") {
		return false;
	}
	if (!probeSecretTool()) {
		return false;
	}
	const r = spawnSync(
		"secret-tool",
		[
			"lookup",
			"service",
			"@@workers-auth-probe-does-not-exist@@",
			"account",
			"@@probe@@",
		],
		{ encoding: "utf-8" }
	);
	// Exit 1 = no match (D-Bus + keyring both fine).
	// Anything else (e.g. "Cannot autolaunch D-Bus without X11 $DISPLAY")
	// = unusable; skip.
	return r.status === 1;
}

describe.skipIf(process.platform !== "darwin")(
	"MacSecurityKeyProvider — integration against /usr/bin/security",
	() => {
		const provider: { current: KeyProvider | undefined } = {
			current: undefined,
		};

		afterEach(() => {
			// Best-effort cleanup so we never leave a stray entry on the
			// developer's keychain after a failing test run.
			try {
				provider.current?.deleteKey();
			} catch {
				/* swallow — the test under test may have already cleared it */
			}
			provider.current = undefined;
		});

		const makeProvider = () =>
			new MacSecurityKeyProvider(uniqueServiceName("workers-auth-itest"));

		runKeyProviderRoundTripContract(makeProvider, provider);
	}
);

describe.skipIf(!isSecretToolBackendReachable())(
	"LinuxSecretToolKeyProvider — integration against `secret-tool`",
	() => {
		const provider: { current: KeyProvider | undefined } = {
			current: undefined,
		};

		afterEach(() => {
			try {
				provider.current?.deleteKey();
			} catch {
				/* swallow — see mac integration cleanup note */
			}
			provider.current = undefined;
		});

		const makeProvider = () =>
			new LinuxSecretToolKeyProvider(uniqueServiceName("workers-auth-itest"));

		runKeyProviderRoundTripContract(makeProvider, provider);
	}
);
