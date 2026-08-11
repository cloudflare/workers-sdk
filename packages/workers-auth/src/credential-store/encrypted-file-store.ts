import { existsSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "@cloudflare/workers-utils";
import { ProcessOwnerChecker } from "@cloudflare/workers-utils/file-system";
import { clearFile, writeFileAtomically } from "../core/atomic-write";
import { parseFile, stringifyFile } from "../core/file-format";
import { getRefreshLockPath, tryWithRefreshLock } from "../refresh-lock";
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
import type { FileFormat } from "../core/file-format";
import type { CredentialStore } from "./interface";
import type { KeyProvider } from "./key-providers/interface";

/**
 * Absolute path to the encrypted credentials file for the given auth profile
 * (defaulting to the active Cloudflare API environment's default profile).
 *
 * `configPath` is the consumer's global config directory (see
 * {@link getAuthConfigFilePath}). Sibling of the plaintext `<profile>.toml` so
 * the migration code can non-destructively read the old file before writing the
 * new one.
 */
export function getEncryptedAuthConfigFilePath(
	configPath: string,
	profile?: string
): string {
	return path.join(
		configPath,
		"config",
		`${resolveAuthProfileBaseName(profile)}.enc`
	);
}

/**
 * Result of a successful migration from a plaintext TOML file
 * into an encrypted file backed by a `KeyProvider`. Surfaced so the
 * resolver can log a one-line summary when migration runs.
 */
export interface PlaintextMigrationResult {
	plaintextPath: string;
	encryptedPath: string;
	keyProviderDescription: string;
}

/**
 * Optional callback invoked by {@link EncryptedFileCredentialStore.read}
 * when it transparently migrates a plaintext TOML file into the
 * encrypted file on first read.
 *
 * The resolver wires this to its logger; left undefined when the store
 * is constructed standalone (e.g. by tests).
 */
export type OnPlaintextMigration = (result: PlaintextMigrationResult) => void;

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

	/**
	 * @param configPath consumer-provided global config directory (the CLI
	 * owns where its config lives, so workers-auth never resolves it itself).
	 * @param keyProvider the OS-keyring backend holding the encryption key.
	 * @param onPlaintextMigration optional callback invoked when a plaintext
	 * file is migrated into the encrypted layout on first read.
	 * @param profile the auth profile (defaults to the active environment's
	 * default profile).
	 * @param format on-disk format of the plaintext sibling file and the
	 * encrypted payload (defaults to TOML for wrangler).
	 * @param owners process-identity cache shared with the owning auth flow or resolver.
	 */
	constructor(
		private readonly configPath: string,
		private readonly keyProvider: KeyProvider,
		private readonly onPlaintextMigration?: OnPlaintextMigration,
		private readonly profile?: string,
		private readonly format: FileFormat = "toml",
		private readonly owners = new ProcessOwnerChecker()
	) {}

	/** Bind migration and credential writes to the transaction's identity cache. */
	getForTransaction(owners = this.owners): EncryptedFileCredentialStore {
		return new EncryptedFileCredentialStore(
			this.configPath,
			this.keyProvider,
			this.onPlaintextMigration,
			this.profile,
			this.format,
			owners
		);
	}

	private plaintextPath(): string {
		return getAuthConfigFilePath(this.configPath, this.profile, this.format);
	}

	read(): UserAuthConfig | undefined {
		const encryptedPath = getEncryptedAuthConfigFilePath(
			this.configPath,
			this.profile
		);
		if (existsSync(encryptedPath)) {
			return this.readEncryptedFile(encryptedPath);
		}
		// No encrypted file yet — see if there's a plaintext file we
		// should migrate into the encrypted layout. This makes opt-in
		// transparent: the next `read()` after the user runs
		// `wrangler login --use-keyring` returns the migrated credentials.
		const plaintextPath = this.plaintextPath();
		if (existsSync(plaintextPath)) {
			const migration = tryWithRefreshLock(
				getRefreshLockPath(encryptedPath),
				() =>
					existsSync(encryptedPath)
						? this.readEncryptedFile(encryptedPath)
						: this.readPlaintext(plaintextPath, encryptedPath, true),
				undefined,
				this.owners
			);
			return migration.acquired
				? migration.value
				: this.readPlaintext(plaintextPath, encryptedPath, false);
		}
		return undefined;
	}

	write(config: UserAuthConfig): void {
		const key = this.ensureKey();
		const plaintext = stringifyFile(this.format, config);
		const envelope = encryptString(plaintext, key);
		const encryptedPath = getEncryptedAuthConfigFilePath(
			this.configPath,
			this.profile
		);
		writeFileAtomically(
			encryptedPath,
			JSON.stringify(envelope, null, "\t"),
			this.owners
		);
		// Defensively scrub any plaintext file once we've written
		// the encrypted version. Skipping this would leave plaintext
		// credentials on disk indefinitely after the very first
		// `--use-keyring` login.
		const plaintextPath = this.plaintextPath();
		clearFile(plaintextPath, this.owners);
	}

	clear(): boolean {
		const encryptedPath = getEncryptedAuthConfigFilePath(
			this.configPath,
			this.profile
		);
		const plaintextPath = this.plaintextPath();
		const encryptedExisted = clearFile(encryptedPath, this.owners);
		// Also scrub any plaintext file, in case the user toggled
		// backends in a previous session and the plaintext file lingered.
		const plaintextExisted = clearFile(plaintextPath, this.owners);
		try {
			this.keyProvider.deleteKey();
		} catch {
			// Best-effort: `deleteKey()` is documented as idempotent and some
			// backends surface NoEntry on a missing key, which is fine here.
			// We also swallow genuine failures (locked keyring, D-Bus down,
			// permission denied) — the `.enc` ciphertext is already removed
			// above, so a lingering bare key is useless without it. `clear()`
			// still reports whether the credential *files* existed.
		}
		return encryptedExisted || plaintextExisted;
	}

	path(): string {
		return getEncryptedAuthConfigFilePath(this.configPath, this.profile);
	}

	describe(): string {
		return `Encrypted file (${getEncryptedAuthConfigFilePath(this.configPath, this.profile)}) with key in ${this.keyProvider.describe()}`;
	}

	/* ------------------------------------------------------------------ */
	/* Internals                                                           */
	/* ------------------------------------------------------------------ */

	private readEncryptedFile(encryptedPath: string): UserAuthConfig | undefined {
		const key = this.keyProvider.getKey();
		if (key === undefined) {
			// File present but key missing — treat as "not logged in" so
			// the next login regenerates the key and re-encrypts. Matches
			// the plaintext store's "no file → not logged in" semantics.
			return undefined;
		}
		// Read the file *outside* the try/catch so genuine filesystem errors
		// (`EACCES`, `EISDIR`, disk full, ...) propagate instead of being
		// misreported as "not logged in" — which would let the next login
		// silently overwrite an unreadable-but-present file and lose its key.
		//
		// `existsSync` was already checked by `read()`, so the only failures
		// reaching here are real IO errors.
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
			return parseFile(this.format, plaintext) as UserAuthConfig;
		} catch {
			// Plaintext decrypted but is not parseable in the expected
			// format — corrupted.
			return undefined;
		}
	}

	private readPlaintext(
		plaintextPath: string,
		encryptedPath: string,
		migrate: boolean
	): UserAuthConfig | undefined {
		// Genuine filesystem errors (`EACCES`, `EISDIR`, ...) propagate;
		// `read()` already confirmed the file exists, so only
		// real IO failures reach here. A successfully-read-but-corrupt
		// TOML body still collapses to "not logged in" below.
		if (!existsSync(plaintextPath)) {
			return existsSync(encryptedPath)
				? this.readEncryptedFile(encryptedPath)
				: undefined;
		}
		const raw = readFileSync(plaintextPath);
		let plaintext: UserAuthConfig;
		try {
			plaintext = parseFile(this.format, raw) as UserAuthConfig;
		} catch {
			// Plaintext file parsed unsuccessfully — bail out rather than
			// partially migrate. The caller treats this as "not logged
			// in" and the user will need to re-login.
			return undefined;
		}
		if (migrate) {
			this.write(plaintext);
			this.onPlaintextMigration?.({
				plaintextPath,
				encryptedPath,
				keyProviderDescription: this.keyProvider.describe(),
			});
		}
		return plaintext;
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
