import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric key length used by AES-256: 32 bytes.
 */
export const KEY_LENGTH_BYTES = 32;

/**
 * Initialization vector / nonce length for AES-GCM. The 12-byte nonce is
 * the canonical choice — it's what NIST SP 800-38D recommends and what
 * essentially every AEAD library defaults to.
 */
const IV_LENGTH_BYTES = 12;

/**
 * Authentication-tag length for AES-GCM, in bytes. 16 is the maximum and
 * what `node:crypto` uses by default.
 */
const TAG_LENGTH_BYTES = 16;

/**
 * Self-documenting algorithm identifier stamped into the on-disk envelope.
 */
const ALGORITHM_LABEL = "AES-256-GCM";

/** Cipher name as accepted by `createCipheriv` / `createDecipheriv`. */
const CIPHER_NAME = "aes-256-gcm";

/**
 * Envelope format for the encrypted payload written to disk.
 *
 * The `v` field lets us evolve the format (e.g. switch algorithm, add key
 * IDs) without breaking older readers — they can detect an unknown version
 * and refuse to decrypt rather than fail in an obscure way deep inside
 * the cipher.
 */
export interface EncryptedEnvelope {
	/** Schema version. Bump on incompatible changes. */
	v: 1;
	/** Algorithm label. Informational; the reader still validates against {@link CIPHER_NAME}. */
	alg: typeof ALGORITHM_LABEL;
	/** Base64-encoded 12-byte IV. */
	iv: string;
	/** Base64-encoded 16-byte GCM auth tag. */
	tag: string;
	/** Base64-encoded ciphertext. */
	ciphertext: string;
}

/**
 * Generate a fresh 32-byte symmetric key suitable for AES-256.
 *
 * Uses `node:crypto.randomBytes`, which is a thin wrapper over the OS
 * CSPRNG (`/dev/urandom` on Unix, `BCryptGenRandom` on Windows).
 */
export function generateKey(): Uint8Array {
	return new Uint8Array(randomBytes(KEY_LENGTH_BYTES));
}

/**
 * Encrypt a UTF-8 plaintext into an {@link EncryptedEnvelope} using
 * AES-256-GCM with a freshly-generated IV.
 *
 * GCM is authenticated encryption: the auth tag is computed over the
 * ciphertext and validated by {@link decryptString}. Any tampering with
 * the IV, tag, or ciphertext causes decryption to throw.
 *
 * IV uniqueness is critical for GCM security — generating a fresh random
 * IV per call (rather than counter-based) keeps callers from accidentally
 * reusing one when the same key encrypts multiple payloads.
 */
export function encryptString(
	plaintext: string,
	key: Uint8Array
): EncryptedEnvelope {
	if (key.length !== KEY_LENGTH_BYTES) {
		throw new Error(
			`AES-256-GCM requires a ${KEY_LENGTH_BYTES}-byte key (got ${key.length} bytes).`
		);
	}
	const iv = randomBytes(IV_LENGTH_BYTES);
	const cipher = createCipheriv(CIPHER_NAME, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf-8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return {
		v: 1,
		alg: ALGORITHM_LABEL,
		iv: iv.toString("base64"),
		tag: tag.toString("base64"),
		ciphertext: ciphertext.toString("base64"),
	};
}

/**
 * Decrypt an {@link EncryptedEnvelope} back into the original UTF-8
 * plaintext.
 *
 * @throws {Error} when the key length is wrong, the envelope version is
 * unknown, the IV/tag lengths don't match what AES-GCM expects, or the
 * GCM auth tag fails to verify (tampering or wrong key).
 */
export function decryptString(
	envelope: EncryptedEnvelope,
	key: Uint8Array
): string {
	if (key.length !== KEY_LENGTH_BYTES) {
		throw new Error(
			`AES-256-GCM requires a ${KEY_LENGTH_BYTES}-byte key (got ${key.length} bytes).`
		);
	}
	if (envelope.v !== 1) {
		throw new Error(
			`Unsupported encrypted envelope version: ${(envelope as { v: unknown }).v}.`
		);
	}
	const iv = Buffer.from(envelope.iv, "base64");
	const tag = Buffer.from(envelope.tag, "base64");
	const ciphertext = Buffer.from(envelope.ciphertext, "base64");
	if (iv.length !== IV_LENGTH_BYTES) {
		throw new Error(
			`Expected ${IV_LENGTH_BYTES}-byte IV in envelope (got ${iv.length} bytes).`
		);
	}
	if (tag.length !== TAG_LENGTH_BYTES) {
		throw new Error(
			`Expected ${TAG_LENGTH_BYTES}-byte auth tag in envelope (got ${tag.length} bytes).`
		);
	}
	const decipher = createDecipheriv(CIPHER_NAME, key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([
		decipher.update(ciphertext),
		// `final()` is where GCM verifies the auth tag and throws on
		// mismatch. We let that error propagate so callers can decide
		// whether to treat it as "not logged in" or surface it.
		decipher.final(),
	]);
	return plaintext.toString("utf-8");
}

/**
 * Type-narrow `unknown` to an {@link EncryptedEnvelope}, returning
 * `undefined` when the input doesn't match the schema.
 *
 * Used by {@link EncryptedFileCredentialStore.read} to handle corrupted /
 * truncated / pre-format-v1 files as "no credentials stored" rather than
 * crashing the consumer.
 */
export function parseEncryptedEnvelope(
	raw: unknown
): EncryptedEnvelope | undefined {
	if (typeof raw !== "object" || raw === null) {
		return undefined;
	}
	const candidate = raw as Partial<EncryptedEnvelope>;
	if (
		candidate.v !== 1 ||
		candidate.alg !== ALGORITHM_LABEL ||
		typeof candidate.iv !== "string" ||
		typeof candidate.tag !== "string" ||
		typeof candidate.ciphertext !== "string"
	) {
		return undefined;
	}
	return candidate as EncryptedEnvelope;
}
