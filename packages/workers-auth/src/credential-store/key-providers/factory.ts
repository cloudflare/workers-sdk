import {
	findKeyringBinding,
	getKeyringInstallDir,
	installKeyringBindingSync,
} from "./lazy-installer";
import {
	LinuxSecretToolKeyProvider,
	probeSecretTool,
} from "./linux-secret-tool";
import { MacSecurityKeyProvider } from "./mac-security";
import { NapiKeyringKeyProvider } from "./napi-keyring";
import type { KeyProvider } from "./interface";

/**
 * Outcome of trying to create a `KeyProvider` for the current platform.
 *
 * - `available`: a provider exists and is ready to use immediately.
 * - `needs-install`: a provider is in principle supported but the local
 *   binding/tool isn't installed yet. The resolver decides whether to
 *   attempt an interactive install or surface remediation.
 * - `unsupported`: the platform has no `KeyProvider` implementation
 *   (e.g. FreeBSD). The resolver falls back to file storage.
 */
export type KeyProviderResolution =
	| { kind: "available"; provider: KeyProvider }
	| {
			kind: "needs-install";
			install: () => void;
			afterInstall: () => KeyProvider;
	  }
	| { kind: "unsupported" };

/**
 * Test seam: when set, the resolver bypasses platform detection and uses
 * this factory to construct the provider. Used by both unit tests of the
 * resolver and consumer-side integration tests that want an in-memory
 * keyring across all platforms.
 */
let testProviderFactory:
	| ((serviceName: string, profile?: string) => KeyProvider)
	| undefined;

/**
 * Inject a `KeyProvider` factory for testing. Pass `undefined` to restore
 * the real per-platform resolution. The factory receives the auth profile
 * so profile-aware tests can hand back a provider scoped to that profile.
 */
export function setKeyProviderFactoryForTesting(
	factory: ((serviceName: string, profile?: string) => KeyProvider) | undefined
): void {
	testProviderFactory = factory;
}

/**
 * Resolve the appropriate `KeyProvider` for the current platform.
 *
 * Pure resolution: this function never spawns long-running work, never
 * installs anything, and never logs. The "needs-install" arm returns
 * thunks the caller can invoke once it has decided how to handle the
 * missing-binding case (interactive install vs. hard-error).
 *
 * `configPath` is the consumer's global config directory; on Windows it locates
 * the lazy-installed `@napi-rs/keyring` binding under the CLI's own config dir.
 * The macOS / Linux backends don't use it.
 */
export function resolveKeyProvider(
	serviceName: string,
	profile: string | undefined,
	configPath: string
): KeyProviderResolution {
	if (testProviderFactory !== undefined) {
		return {
			kind: "available",
			provider: testProviderFactory(serviceName, profile),
		};
	}

	switch (process.platform) {
		case "darwin":
			// `/usr/bin/security` is part of every macOS install, so this is
			// always available without a probe.
			return {
				kind: "available",
				provider: new MacSecurityKeyProvider(serviceName, profile),
			};

		case "linux":
			if (probeSecretTool()) {
				return {
					kind: "available",
					provider: new LinuxSecretToolKeyProvider(serviceName, profile),
				};
			}
			// No interactive install path on Linux: `libsecret-tools` lives
			// in the OS package manager, which we won't drive automatically.
			// Falling back to `@napi-rs/keyring` here wouldn't help either —
			// its Linux backend dynamically links libsecret too, so it fails
			// for the very same reason `secret-tool` is missing. The resolver
			// surfaces install hints instead.
			return { kind: "unsupported" };

		case "win32": {
			const installDir = getKeyringInstallDir(configPath);
			if (findKeyringBinding(installDir) !== null) {
				return {
					kind: "available",
					provider: new NapiKeyringKeyProvider(
						serviceName,
						installDir,
						profile
					),
				};
			}
			return {
				kind: "needs-install",
				install: () => installKeyringBindingSync(installDir),
				afterInstall: () =>
					new NapiKeyringKeyProvider(serviceName, installDir, profile),
			};
		}

		default:
			return { kind: "unsupported" };
	}
}
