import { resolveAuthProfileBaseName } from "../file-store";

/**
 * Resolve the keyring account name for the given auth profile.
 *
 * Shares {@link resolveAuthProfileBaseName} with the file paths so the
 * keyring entry tracks the same identity as the on-disk files: the default
 * profile gets `default` in production or the environment name otherwise
 * (so a single OS user can hold production and staging credentials
 * side-by-side), while a named profile gets the profile name. This means
 * each profile holds its own encryption key, so clearing one profile's
 * credentials never disturbs another's.
 *
 * The service name is consumer-configured (passed to each `KeyProvider`'s
 * constructor) — this account-name derivation is Cloudflare-wide and stays
 * inside `@cloudflare/workers-auth`.
 */
export function getKeyringAccountName(profile?: string): string {
	return resolveAuthProfileBaseName(profile);
}

/**
 * Envelope format for the keyring-held key. JSON-serialized for forward
 * compatibility: future versions can add fields without changing how older
 * versions parse existing entries.
 */
export interface KeyringKeyEnvelope {
	/** Schema version. Bump on incompatible changes. */
	v: 1;
	/** Base64-encoded 32-byte AES-256 key. */
	key: string;
	/** ISO-8601 timestamp of when the key was generated, informational only. */
	created: string;
}

/**
 * Serialize a raw 32-byte key into the JSON envelope stored in the OS keyring.
 */
export function encodeKeyEnvelope(key: Uint8Array): string {
	const envelope: KeyringKeyEnvelope = {
		v: 1,
		key: Buffer.from(key).toString("base64"),
		created: new Date().toISOString(),
	};
	return JSON.stringify(envelope);
}

/**
 * Parse the JSON envelope stored in the OS keyring back into a raw key.
 *
 * Returns `undefined` when the input is empty, malformed, or wraps a
 * future-version envelope we don't understand — callers treat any of these
 * as "no key stored" and regenerate.
 */
export function decodeKeyEnvelope(raw: string): Uint8Array | undefined {
	if (raw === "") {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as KeyringKeyEnvelope).v !== 1 ||
		typeof (parsed as KeyringKeyEnvelope).key !== "string"
	) {
		return undefined;
	}
	try {
		const buf = Buffer.from((parsed as KeyringKeyEnvelope).key, "base64");
		if (buf.length !== 32) {
			return undefined;
		}
		return new Uint8Array(buf);
	} catch {
		return undefined;
	}
}
