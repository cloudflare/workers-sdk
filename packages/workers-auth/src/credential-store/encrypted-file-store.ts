import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	readFileSync,
} from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import {
	decryptString,
	encryptString,
	generateKey,
	parseEncryptedEnvelope,
} from "./crypto";
import {
	getAuthConfigFilePath,
	resolveAuthProfileBaseName,
} from "./file-store";
import type { UserAuthConfig } from "../config-file/auth";
import type { CredentialStore } from "./interface";
import type { KeyProvider } from "./key-providers/interface";

/**
 * Absolute path to the encrypted credentials file for the given auth profile
 * (defaulting to the active Cloudflare API environment's default profile).
 *
 * Sibling of the legacy plaintext `<profile>.toml` so the migration code can
 * non-destructively read the old file before writing the new one.
 */
export function getEncryptedAuthConfigFilePath(profile?: string): string {
	return path.join(
		getGlobalWranglerConfigPath(),
		"config",
		`${resolveAuthProfileBaseName(profile)}.enc`
	);
}

/**
 * Result of a successful migration from a legacy plaintext TOML file
 * into an encrypted file backed by a `KeyProvider`. Surfaced so the
 * resolver can log a one-line summary when migration runs.
 */
export interface LegacyMigrationResult {
	legacyPath: string;
	encryptedPath: string;
	keyProviderDescription: string;
}

/**
 * Optional callback invoked by {@link EncryptedFileCredentialStore.read}
 * when it transparently migrates a legacy plaintext TOML file into the
 * encrypted file on first read.
 *
 * The resolver wires this to its logger; left undefined when the store
 * is constructed standalone (e.g. by tests).
 */
export type OnLegacyMigration = (result: LegacyMigrationResult) => void;

/**
 * Credentials store backed by an AES-256-GCM-encrypted file on disk and a
 * 32-byte encryption key held in the OS keyring via a {@link KeyProvider}.
 *
 * The combination decouples credential payload size from any per-platform
 * keyring item size limit (notably the ~2.5 KB macOS Keychain limit on
 * generic-password items): the keyring entry is always small (~44 bytes
 * of base64), while the credential blob lives in the encrypted file and
 * is free to grow as the schema evolves.
 *
 * Threat model:
 *   - File leaked from a backup without the keyring entry: ciphertext is
 *     useless, GCM auth tag prevents tampering.
 *   - Keyring entry leaked without the file: a bare 32-byte key, useless
 *     without the ciphertext.
 *   - Attacker with full local user access: can decrypt (same as
 *     direct-keyring storage — both backends expose secrets to root /
 *     same-user processes).
 */
export class EncryptedFileCredentialStore implements CredentialStore {
	readonly kind = "encrypted-file" as const;

	constructor(
		private readonly keyProvider: KeyProvider,
		private readonly onLegacyMigration?: OnLegacyMigration,
		private readonly profile?: string
	) {}

	read(): UserAuthConfig | undefined {
		// `read()` returns `undefined` for every "no usable data" shape —
		// see the `ConfigStorage<T>` interface docs. That collapses
		// "no encrypted file", "encrypted file but key missing",
		// "ciphertext tampered/corrupted", and "decrypted plaintext is
		// not valid TOML" into one consumer-visible state ("not logged
		// in"). Genuine errors (filesystem permission failures, etc.)
		// still propagate via `readEncryptedFile` / the legacy parser.
		const encryptedPath = getEncryptedAuthConfigFilePath(this.profile);
		if (existsSync(encryptedPath)) {
			return this.readEncryptedFile(encryptedPath);
		}
		// No encrypted file yet — see if there's a legacy plaintext file we
		// should migrate into the encrypted layout. This makes opt-in
		// transparent: the next `read()` after the user runs
		// `wrangler login --use-keyring` returns the migrated credentials.
		const legacyPath = getAuthConfigFilePath(this.profile);
		if (existsSync(legacyPath)) {
			return this.migrateFromLegacy(legacyPath, encryptedPath);
		}
		return undefined;
	}

	write(config: UserAuthConfig): void {
		const key = this.ensureKey();
		const plaintext = TOML.stringify(config);
		const envelope = encryptString(plaintext, key);
		const encryptedPath = getEncryptedAuthConfigFilePath(this.profile);
		mkdirSync(path.dirname(encryptedPath), { recursive: true });
		writeFileSync(encryptedPath, JSON.stringify(envelope, null, "\t"), {
			encoding: "utf-8",
			mode: 0o600,
		});
		chmodSync(encryptedPath, 0o600);
		// Defensively scrub any legacy plaintext file once we've written
		// the encrypted version. Skipping this would leave plaintext
		// credentials on disk indefinitely after the very first
		// `--use-keyring` login.
		const legacyPath = getAuthConfigFilePath(this.profile);
		if (existsSync(legacyPath)) {
			rmSync(legacyPath);
		}
	}

	clear(): boolean {
		const encryptedPath = getEncryptedAuthConfigFilePath(this.profile);
		const legacyPath = getAuthConfigFilePath(this.profile);
		let existed = false;
		if (existsSync(encryptedPath)) {
			rmSync(encryptedPath);
			existed = true;
		}
		// Also scrub any legacy plaintext file, in case the user toggled
		// backends in a previous session and the legacy file lingered.
		if (existsSync(legacyPath)) {
			rmSync(legacyPath);
			existed = true;
		}
		try {
			this.keyProvider.deleteKey();
		} catch {
			// `deleteKey()` is documented as idempotent; some backends
			// surface NoEntry on a missing key, which is fine here.
		}
		return existed;
	}

	path(): string {
		return getEncryptedAuthConfigFilePath(this.profile);
	}

	describe(): string {
		return `Encrypted file (${getEncryptedAuthConfigFilePath(this.profile)}) with key in ${this.keyProvider.describe()}`;
	}

	/* ------------------------------------------------------------------ */
	/* Internals                                                           */
	/* ------------------------------------------------------------------ */

	private readEncryptedFile(encryptedPath: string): UserAuthConfig | undefined {
		const key = this.keyProvider.getKey();
		if (key === undefined) {
			// File present but key missing — treat as "not logged in" so
			// the next login regenerates the key and re-encrypts. Matches
			// the historical "no file → not logged in" semantics.
			return undefined;
		}
		// Read the file *outside* the try/catch so genuine filesystem
		// errors (`EACCES`, `EISDIR`, disk full, ...) propagate per the
		// `ConfigStorage<T>` contract instead of being misreported as
		// "not logged in" — which would let the next login silently
		// overwrite an unreadable-but-present file and lose its key.
		// `existsSync` was already checked by `read()`, so the only
		// failures reaching here are real IO errors.
		const raw = readFileSync(encryptedPath);
		let envelope;
		try {
			envelope = parseEncryptedEnvelope(JSON.parse(raw));
		} catch {
			// Malformed JSON — treat as corrupted and let the next write
			// overwrite it.
			return undefined;
		}
		if (envelope === undefined) {
			return undefined;
		}
		let plaintext: string;
		try {
			plaintext = decryptString(envelope, key);
		} catch {
			// Authentication tag mismatch (tampered file or wrong key) —
			// treat as "not logged in".
			return undefined;
		}
		try {
			return TOML.parse(plaintext) as unknown as UserAuthConfig;
		} catch {
			// Plaintext decrypted but is not valid TOML — corrupted.
			return undefined;
		}
	}

	private migrateFromLegacy(
		legacyPath: string,
		encryptedPath: string
	): UserAuthConfig | undefined {
		// Read outside the try/catch so genuine filesystem errors
		// (`EACCES`, `EISDIR`, ...) propagate per the `ConfigStorage<T>`
		// contract; `read()` already confirmed the file exists, so only
		// real IO failures reach here. A successfully-read-but-corrupt
		// TOML body still collapses to "not logged in" below.
		const raw = readFileSync(legacyPath);
		let legacy: UserAuthConfig;
		try {
			legacy = TOML.parse(raw) as unknown as UserAuthConfig;
		} catch {
			// Legacy file parsed unsuccessfully — bail out rather than
			// partially migrate. The caller treats this as "not logged
			// in" and the user will need to re-login.
			return undefined;
		}
		this.write(legacy);
		this.onLegacyMigration?.({
			legacyPath,
			encryptedPath,
			keyProviderDescription: this.keyProvider.describe(),
		});
		return legacy;
	}

	/**
	 * Return the existing encryption key, or generate + persist a fresh
	 * one when none exists yet. Called from `write()` so the first
	 * `wrangler login --use-keyring` is fully bootstrapping.
	 */
	private ensureKey(): Uint8Array {
		const existing = this.keyProvider.getKey();
		if (existing !== undefined) {
			return existing;
		}
		const fresh = generateKey();
		this.keyProvider.setKey(fresh);
		return fresh;
	}
}
