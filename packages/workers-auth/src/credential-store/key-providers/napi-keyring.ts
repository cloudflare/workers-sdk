import { resolveKeyringEntryFactory } from "./lazy-installer";
import {
	decodeKeyEnvelope,
	encodeKeyEnvelope,
	getKeyringAccountName,
} from "./shared";
import type { KeyProvider } from "./interface";
import type { KeyringEntry } from "./lazy-installer";

/**
 * Backend that stores the encryption key via `@napi-rs/keyring`'s
 * native `Entry` class.
 *
 * Used on Windows once the binding has been lazy-installed (via the
 * resolver), and by tests on every platform that register an in-memory
 * `KeyringEntryFactory` via {@link setKeyringEntryFactory}.
 *
 * On Windows the binding talks to the Credential Manager wincred API.
 * On macOS / Linux (when used by tests), the test factory short-circuits
 * the lazy load so no real keychain is touched.
 */
export class NapiKeyringKeyProvider implements KeyProvider {
	/**
	 * @param serviceName keyring service identifier (e.g. `"wrangler"`).
	 * @param installDir directory hosting the lazy-installed `@napi-rs/keyring`
	 * binding, derived from the consumer's config path.
	 * @param profile the auth profile (selects the keyring account name).
	 */
	constructor(
		private readonly serviceName: string,
		private readonly installDir: string,
		private readonly profile?: string
	) {}

	// Resolve the entry factory (and account name) lazily on every call
	// rather than caching them on construction: on Windows the native
	// binding is installed *after* this provider is constructed (the
	// resolver builds the provider, then runs the install), and tests
	// swap the factory between operations via `setKeyringEntryFactory`.
	// Caching on the instance would pin a stale/absent factory. The
	// account-name lookup is a cheap env read, so recomputing is free.
	private entry(): KeyringEntry {
		return resolveKeyringEntryFactory(this.installDir)(
			this.serviceName,
			getKeyringAccountName(this.profile)
		);
	}

	getKey(): Uint8Array | undefined {
		const raw = this.entry().getPassword();
		if (raw === null || raw === "") {
			return undefined;
		}
		return decodeKeyEnvelope(raw);
	}

	setKey(key: Uint8Array): void {
		this.entry().setPassword(encodeKeyEnvelope(key));
	}

	deleteKey(): void {
		try {
			this.entry().deletePassword();
		} catch {
			// `deletePassword` throws `NoEntry` when no entry exists yet,
			// which is fine — `deleteKey()` is documented as idempotent.
		}
	}

	describe(): string {
		const platformName =
			process.platform === "win32"
				? "Windows Credential Manager"
				: "OS keyring";
		return `${platformName} via @napi-rs/keyring (service=${this.serviceName}, account=${getKeyringAccountName(this.profile)})`;
	}
}
