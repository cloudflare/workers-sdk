import { existsSync, rmSync } from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import { getCloudflareAuthUseKeyringFromEnv } from "../env-vars";
import {
	EncryptedFileCredentialStore,
	getEncryptedAuthConfigFilePath,
} from "./encrypted-file-store";
import { FileCredentialStore } from "./file-store";
import { resolveKeyProvider } from "./key-providers/factory";
import { PINNED_KEYRING_VERSION } from "./key-providers/lazy-installer";
import { getResolverSessionFlags } from "./state";
import type { AuthConfigStorage } from "../config-file/auth";
import type { OAuthFlowLogger } from "../context";
import type { PlaintextMigrationResult } from "./encrypted-file-store";
import type { CredentialStore } from "./interface";

/**
 * Per-consumer configuration for the credential-storage resolver.
 *
 * Captured by {@link createCredentialStorageContext} in a closure so the
 * returned `storage` adapter and `getActiveStore` function can both
 * re-resolve the active store on every call without re-reading shared
 * mutable module state.
 */
export interface CredentialStorageContext {
	/**
	 * Keyring service identifier (e.g. `"wrangler"`). Becomes the `-s`
	 * argument to `/usr/bin/security`, the `service` attribute for
	 * `secret-tool`, and the `service` argument to `@napi-rs/keyring`'s
	 * `Entry`. Must be non-empty.
	 */
	serviceName: string;

	/**
	 * The consumer's global config directory (e.g. wrangler's
	 * `~/.wrangler`), resolved lazily on every credential operation.
	 *
	 * The client owns where its config lives — `cf` uses a different global
	 * config path than wrangler — so `@cloudflare/workers-auth` never resolves
	 * it itself. A getter (rather than a captured string) is required because
	 * consumers create this context once at module load while tests re-stub
	 * `HOME` / `XDG_CONFIG_HOME` per case, so the path must be re-read on each
	 * call. The credential files (`.toml` / `.enc`) and the Windows keyring
	 * binding all live under this directory.
	 */
	getConfigPath: () => string;

	/**
	 * Whether the user has opted into keyring storage. Consulted on every
	 * credential read/write so runtime preference changes (e.g. a user
	 * toggling the option mid-session) take effect.
	 */
	isKeyringEnabled: () => boolean;

	/** Drop-in replacement for the consumer's logger singleton. */
	logger: OAuthFlowLogger;

	/** Whether the process should not prompt the user. */
	isNonInteractiveOrCI: () => boolean;

	/**
	 * Consumer's CLI name for error-message templating, e.g. `"wrangler"`.
	 * Used in hints like ``Run `<cliName> login --use-keyring` …``.
	 * Defaults to `"your CLI"` when omitted.
	 */
	cliName?: string;
}

/**
 * Bundle returned by {@link createCredentialStorageContext}.
 *
 * - `storageFactory`: maps an auth profile to an {@link AuthConfigStorage}
 *   adapter that delegates to that profile's active {@link CredentialStore}
 *   on every method call. Pass this as `ctx.storageFactory` to
 *   {@link createOAuthFlow}, which calls it with the active profile on every
 *   credential access.
 * - `getActiveStore`: the live `CredentialStore` lookup for a given profile,
 *   suitable for `whoami`-style consumers that want to call `describe()`.
 *
 * Both surfaces are wired against the same closure, so a runtime preference
 * flip (e.g. `wrangler login --no-use-keyring`) is observable through both
 * on the very next call. The profile argument selects which profile's files
 * / keyring entry the resolved store reads and writes.
 */
export interface CredentialStorageBundle {
	storageFactory: (profile?: string) => AuthConfigStorage;
	getActiveStore: (profile?: string) => CredentialStore;
}

/**
 * Build a credential-storage bundle for a consumer (wrangler, future
 * Cloudflare CLIs).
 *
 * The bundle's `storage` is an `AuthConfigStorage` that re-resolves the
 * underlying store on every read/write/clear/path call. Selection order
 * (highest precedence first):
 *
 *   1. `CLOUDFLARE_AUTH_USE_KEYRING=false` env var — forces the file store.
 *   2. `CLOUDFLARE_AUTH_USE_KEYRING=true` env var — forces keyring storage;
 *      failures throw rather than soft-falling-back.
 *   3. `isKeyringEnabled()` callback (the consumer's persistent preference) —
 *      uses keyring storage; failures soft-fall-back with a one-time warning.
 *   4. Otherwise — defaults to the plaintext file store.
 *
 * The env var and the `isKeyringEnabled` callback are re-read on every
 * call so runtime preference changes take effect without rebuilding the
 * storage layer.
 */
export function createCredentialStorageContext(
	context: CredentialStorageContext
): CredentialStorageBundle {
	const config = {
		...context,
		cliName: context.cliName ?? "your CLI",
	};

	function getActiveStore(profile?: string): CredentialStore {
		return resolveActiveCredentialStore(config, profile);
	}

	function storageFactory(profile?: string): AuthConfigStorage {
		// Re-resolve the active store on every method call (not once per
		// `storageFactory(profile)` call) so a preference flip mid-session
		// is observed immediately, matching the pre-profile behaviour.
		return {
			read: () => getActiveStore(profile).read(),
			write: (value) => getActiveStore(profile).write(value),
			clear: () => getActiveStore(profile).clear(),
			path: () => getActiveStore(profile).path(),
		};
	}

	return { storageFactory, getActiveStore };
}

type ResolvedConfig = Required<CredentialStorageContext>;

function resolveActiveCredentialStore(
	config: ResolvedConfig,
	profile?: string
): CredentialStore {
	const envOverride = getCloudflareAuthUseKeyringFromEnv();
	const configPath = config.getConfigPath();

	if (envOverride === false) {
		return new FileCredentialStore(configPath, profile);
	}

	const forcedByEnvVar = envOverride === true;
	const wantsKeyring = envOverride ?? config.isKeyringEnabled() ?? false;

	if (!wantsKeyring) {
		return new FileCredentialStore(configPath, profile);
	}

	const resolution = resolveKeyProvider(
		config.serviceName,
		profile,
		configPath
	);

	switch (resolution.kind) {
		case "available":
			return new EncryptedFileCredentialStore(
				configPath,
				resolution.provider,
				buildMigrationLogger(config),
				profile
			);

		case "needs-install":
			return handleNeedsInstall(resolution, forcedByEnvVar, config, profile);

		case "unsupported":
			return handleUnsupported(forcedByEnvVar, config, profile);
	}
}

/**
 * Build the plaintext-migration callback wired into a new
 * {@link EncryptedFileCredentialStore}. Surfaces the plaintext→encrypted
 * migration at `warn` level (rather than `log`) because the migration
 * deletes the plaintext credentials file on disk, which is a
 * stateful change the user benefits from seeing distinctly in their
 * terminal output.
 */
function buildMigrationLogger(
	config: ResolvedConfig
): (result: PlaintextMigrationResult) => void {
	return (result) => {
		config.logger.warn(
			`Migrated credentials from ${result.plaintextPath} into ${result.encryptedPath} (key in ${result.keyProviderDescription}). The plaintext file has been deleted.`
		);
	};
}

function handleNeedsInstall(
	resolution: Extract<
		ReturnType<typeof resolveKeyProvider>,
		{ kind: "needs-install" }
	>,
	forcedByEnvVar: boolean,
	config: ResolvedConfig,
	profile?: string
): CredentialStore {
	const flags = getResolverSessionFlags();

	if (flags.installFailedThisSession) {
		if (forcedByEnvVar) {
			throw new UserError(
				`CLOUDFLARE_AUTH_USE_KEYRING is set but the keyring backend could not be installed earlier this session.`,
				{ telemetryMessage: "workers-auth keyring install previously failed" }
			);
		}
		return fallbackToFileWithWarning(
			`The keyring backend could not be installed earlier this session; using the plaintext credentials file.`,
			config,
			profile
		);
	}

	if (config.isNonInteractiveOrCI()) {
		throw new UserError(windowsBindingMissingMessage(config.cliName), {
			telemetryMessage: "workers-auth keyring binding not installed",
		});
	}

	try {
		config.logger.log(`🔐 Installing keyring backend (one-time, ~2 MB)…`);
		resolution.install();
	} catch (e) {
		flags.installFailedThisSession = true;
		if (forcedByEnvVar) {
			throw e instanceof UserError
				? e
				: new UserError(
						`Failed to install the keyring backend: ${e instanceof Error ? e.message : String(e)}`,
						{ telemetryMessage: "workers-auth keyring install threw" }
					);
		}
		return fallbackToFileWithWarning(
			`Failed to install the keyring backend (${e instanceof Error ? e.message : String(e)}); falling back to the plaintext credentials file.`,
			config,
			profile
		);
	}

	return new EncryptedFileCredentialStore(
		config.getConfigPath(),
		resolution.afterInstall(),
		buildMigrationLogger(config),
		profile
	);
}

function handleUnsupported(
	forcedByEnvVar: boolean,
	config: ResolvedConfig,
	profile?: string
): CredentialStore {
	const platform = process.platform;

	// Linux without `secret-tool` lands here. macOS and Windows have
	// keyring backends, so this branch covers Linux-missing-tool and
	// genuinely unsupported platforms (FreeBSD, etc.).
	const linuxMissingTool = platform === "linux";
	const message = linuxMissingTool
		? secretToolMissingMessage(config.cliName)
		: `OS keyring storage is not supported on \`${platform}\`; falling back to the plaintext credentials file.`;

	if (forcedByEnvVar) {
		throw new UserError(
			linuxMissingTool
				? `CLOUDFLARE_AUTH_USE_KEYRING is set but ${message}`
				: `CLOUDFLARE_AUTH_USE_KEYRING is set but no keyring backend is available on \`${platform}\`.`,
			{
				telemetryMessage: linuxMissingTool
					? "workers-auth keyring secret tool missing"
					: "workers-auth keyring unsupported platform",
			}
		);
	}

	if (linuxMissingTool && config.isNonInteractiveOrCI()) {
		throw new UserError(message, {
			telemetryMessage: "workers-auth keyring secret tool missing",
		});
	}

	const flags = getResolverSessionFlags();
	if (linuxMissingTool) {
		if (!flags.hasWarnedAboutSecretToolMissing) {
			flags.hasWarnedAboutSecretToolMissing = true;
			config.logger.warn(
				`${message}\n\nFalling back to the plaintext credentials file for this session.`
			);
		}
		return new FileCredentialStore(config.getConfigPath(), profile);
	}

	return fallbackToFileWithWarning(message, config, profile);
}

function fallbackToFileWithWarning(
	message: string,
	config: ResolvedConfig,
	profile?: string
): CredentialStore {
	const flags = getResolverSessionFlags();
	if (!flags.hasWarnedAboutKeyringFallback) {
		flags.hasWarnedAboutKeyringFallback = true;
		config.logger.warn(message);
	}
	return new FileCredentialStore(config.getConfigPath(), profile);
}

function secretToolMissingMessage(cliName: string): string {
	return `\`secret-tool\` is required for OS keyring storage on Linux but is not installed.

Install it via your package manager:
  Debian/Ubuntu:  sudo apt-get install libsecret-tools
  Fedora/RHEL:    sudo dnf install libsecret
  Arch:           sudo pacman -S libsecret
  Alpine:         apk add libsecret

Or disable keyring storage: \`${cliName} login --no-use-keyring\`.`;
}

function windowsBindingMissingMessage(cliName: string): string {
	return `\`@napi-rs/keyring\` is required for OS keyring storage on Windows but is not installed.

Run \`${cliName} login --use-keyring\` interactively to install it automatically, or install it globally for CI:

  npm install -g @napi-rs/keyring@${PINNED_KEYRING_VERSION}

Or disable keyring storage: \`${cliName} login --no-use-keyring\`.`;
}

/**
 * Outcome of {@link scrubEncryptedCredentials}, so callers can tailor their
 * messaging (e.g. warn that a keyring entry may remain).
 */
export interface ScrubEncryptedCredentialsResult {
	/**
	 * Whether the keyring backend was *reachable* — i.e. a `KeyProvider`
	 * resolved for this platform. When `true`, the encrypted store's `clear()`
	 * removed the `.enc` file (and any plaintext `.toml`) and attempted to
	 * delete the keyring key. When `false`, only the `.enc` file was removed
	 * best-effort and a keyring entry (if one exists) was left behind.
	 *
	 * Note this reflects reachability, not that every operation succeeded: the
	 * key deletion is best-effort (see `EncryptedFileCredentialStore.clear()`),
	 * so in the rare case a reachable keyring fails mid-delete the `.enc`
	 * ciphertext is still gone and only a bare, unusable key could linger.
	 */
	backendAvailable: boolean;
	/** Whether an encrypted `.enc` file existed before the scrub. */
	encryptedFileExisted: boolean;
}

/**
 * Best-effort removal of a profile's encrypted credentials (`.enc` file) and
 * the keyring entry holding its encryption key.
 *
 * Shared by the `--no-use-keyring` opt-out (default profile) and
 * `wrangler auth delete <name>` (named profile) so both clear the encrypted
 * backend the same way, independent of the current keyring preference (a
 * profile may have been encrypted in a previous session even though keyring
 * storage is currently disabled).
 *
 * When the keyring backend is reachable, the encrypted store's `clear()`
 * removes the `.enc` file *and* the keyring key (and any plaintext
 * `.toml`). When it isn't (Linux without `secret-tool`, Windows without the
 * binding, an unsupported platform), the `.enc` file is removed best-effort
 * and `backendAvailable` is `false` so the caller can warn that the keyring
 * entry may remain. This never attempts a (Windows) binding install — a scrub
 * must not block on provisioning a backend it is trying to tear down.
 */
export function scrubEncryptedCredentials(options: {
	serviceName: string;
	configPath: string;
	profile?: string;
}): ScrubEncryptedCredentialsResult {
	const encryptedPath = getEncryptedAuthConfigFilePath(
		options.configPath,
		options.profile
	);
	const encryptedFileExisted = existsSync(encryptedPath);

	const resolution = resolveKeyProvider(
		options.serviceName,
		options.profile,
		options.configPath
	);
	if (resolution.kind === "available") {
		new EncryptedFileCredentialStore(
			options.configPath,
			resolution.provider,
			undefined,
			options.profile
		).clear();
		return { backendAvailable: true, encryptedFileExisted };
	}

	// Backend unreachable — the ciphertext is useless without the key, but a
	// stale `.enc` file is confusing and could collide with a future opt-in,
	// so remove it best-effort. The keyring entry (if any) can't be cleared.
	if (encryptedFileExisted) {
		rmSync(encryptedPath);
	}
	return { backendAvailable: false, encryptedFileExisted };
}
