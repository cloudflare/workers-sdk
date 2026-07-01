import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import {
	EncryptedFileCredentialStore,
	getEncryptedAuthConfigFilePath,
} from "../../src/credential-store/encrypted-file-store";
import { getAuthConfigFilePath } from "../../src/credential-store/file-store";
import type { UserAuthConfig } from "../../src/config-file/auth";
import type { KeyProvider } from "../../src/credential-store/key-providers/interface";

class InMemoryKeyProvider implements KeyProvider {
	private key: Uint8Array | undefined;

	constructor(private readonly label: string = "in-memory") {}

	getKey(): Uint8Array | undefined {
		return this.key;
	}

	setKey(key: Uint8Array): void {
		this.key = key;
	}

	deleteKey(): void {
		this.key = undefined;
	}

	describe(): string {
		return this.label;
	}
}

const SAMPLE_CONFIG: UserAuthConfig = {
	oauth_token: "test-oauth-token",
	refresh_token: "test-refresh-token",
	expiration_time: "2099-01-01T00:00:00.000Z",
	scopes: ["account:read"],
};

// The consumer provides the global config dir; resolved fresh per call so the
// runInTempDir HOME stub applies. Wrangler passes `getGlobalConfigPath()`.
const configDir = () => getGlobalConfigPath();

describe("EncryptedFileCredentialStore", () => {
	runInTempDir();

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("round-trips a UserAuthConfig through the encrypted file", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);
		expect(store.read()).toEqual(SAMPLE_CONFIG);
	});

	it("write persists the encrypted file at the `.enc` sibling path", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		new EncryptedFileCredentialStore(configDir(), keyProvider).write(
			SAMPLE_CONFIG
		);
		expect(existsSync(getEncryptedAuthConfigFilePath(configDir()))).toBe(true);
	});

	it("file on disk is JSON envelope with v=1 and AES-256-GCM", ({ expect }) => {
		const keyProvider = new InMemoryKeyProvider();
		new EncryptedFileCredentialStore(configDir(), keyProvider).write(
			SAMPLE_CONFIG
		);
		const raw = JSON.parse(
			readFileSync(getEncryptedAuthConfigFilePath(configDir()), "utf8")
		);
		expect(raw).toMatchObject({
			v: 1,
			alg: "AES-256-GCM",
		});
		expect(typeof raw.iv).toBe("string");
		expect(typeof raw.tag).toBe("string");
		expect(typeof raw.ciphertext).toBe("string");
		// And critically: the on-disk file should not contain the cleartext
		// token anywhere.
		expect(
			readFileSync(getEncryptedAuthConfigFilePath(configDir()), "utf8")
		).not.toContain("test-oauth-token");
	});

	it("first write generates and persists a key when none exists yet", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		expect(keyProvider.getKey()).toBeUndefined();
		new EncryptedFileCredentialStore(configDir(), keyProvider).write(
			SAMPLE_CONFIG
		);
		const key = keyProvider.getKey();
		expect(key).toBeDefined();
		expect(key?.length).toBe(32);
	});

	it("subsequent writes reuse the existing key", ({ expect }) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);
		const firstKey = keyProvider.getKey();
		store.write({ ...SAMPLE_CONFIG, oauth_token: "new" });
		expect(keyProvider.getKey()).toEqual(firstKey);
	});

	// Per the `ConfigStorage<T>.read()` contract, all of the
	// "no usable data stored" shapes collapse to `undefined` — including
	// missing file, missing key, tampered ciphertext, and corrupted
	// envelope. The consumer treats `undefined` as "not logged in" and
	// the next login regenerates the key and re-encrypts cleanly.
	it("read returns undefined when neither file nor key exist", ({ expect }) => {
		const store = new EncryptedFileCredentialStore(
			configDir(),
			new InMemoryKeyProvider()
		);
		expect(store.read()).toBeUndefined();
	});

	it("read returns undefined when the file exists but the key is missing", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);
		keyProvider.deleteKey();
		expect(store.read()).toBeUndefined();
	});

	it("read returns undefined when the file is tampered with", ({ expect }) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);

		// Flip a byte in the ciphertext.
		const filePath = getEncryptedAuthConfigFilePath(configDir());
		const envelope = JSON.parse(readFileSync(filePath, "utf8"));
		const cipherBytes = Buffer.from(envelope.ciphertext, "base64");
		cipherBytes[0] ^= 0x01;
		envelope.ciphertext = cipherBytes.toString("base64");
		writeFileSync(filePath, JSON.stringify(envelope));

		expect(store.read()).toBeUndefined();
	});

	it("read returns undefined for a corrupted envelope (invalid JSON)", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);
		writeFileSync(getEncryptedAuthConfigFilePath(configDir()), "not json");
		expect(store.read()).toBeUndefined();
	});

	// Genuine filesystem errors must NOT collapse to `undefined` (which
	// the consumer reads as "not logged in" and would then overwrite the
	// file on the next login, losing its key). Per the `ConfigStorage<T>`
	// contract they propagate. We simulate an unreadable-but-present file
	// with a directory at the `.enc` path, so `readFileSync` raises
	// `EISDIR` after `existsSync` reports the path as present.
	it("read throws on a genuine filesystem error instead of silently returning undefined", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		keyProvider.setKey(new Uint8Array(32));
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		mkdirSync(getEncryptedAuthConfigFilePath(configDir()), { recursive: true });
		expect(() => store.read()).toThrow();
	});

	it("clear removes both the encrypted file and the keyring entry", ({
		expect,
	}) => {
		const keyProvider = new InMemoryKeyProvider();
		const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
		store.write(SAMPLE_CONFIG);
		expect(existsSync(getEncryptedAuthConfigFilePath(configDir()))).toBe(true);
		expect(keyProvider.getKey()).toBeDefined();

		expect(store.clear()).toBe(true);
		expect(existsSync(getEncryptedAuthConfigFilePath(configDir()))).toBe(false);
		expect(keyProvider.getKey()).toBeUndefined();
	});

	it("clear is idempotent and returns false when nothing existed", ({
		expect,
	}) => {
		const store = new EncryptedFileCredentialStore(
			configDir(),
			new InMemoryKeyProvider()
		);
		expect(store.clear()).toBe(false);
	});

	it("path() returns the encrypted file path", ({ expect }) => {
		const store = new EncryptedFileCredentialStore(
			configDir(),
			new InMemoryKeyProvider()
		);
		expect(store.path()).toBe(getEncryptedAuthConfigFilePath(configDir()));
	});

	it("describe() identifies the encrypted file path and key location", ({
		expect,
	}) => {
		const store = new EncryptedFileCredentialStore(
			configDir(),
			new InMemoryKeyProvider("test keyring")
		);
		expect(store.describe()).toContain("Encrypted file");
		expect(store.describe()).toContain("test keyring");
	});

	it("kind is 'encrypted-file'", ({ expect }) => {
		expect(
			new EncryptedFileCredentialStore(configDir(), new InMemoryKeyProvider())
				.kind
		).toBe("encrypted-file");
	});

	it("WRANGLER_API_ENVIRONMENT scopes the encrypted file path", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
		expect(getEncryptedAuthConfigFilePath(configDir())).toMatch(
			/staging\.enc$/
		);
	});

	describe("plaintext migration", () => {
		it("migrates plaintext TOML into the encrypted file on first read", ({
			expect,
		}) => {
			const plaintextPath = getAuthConfigFilePath(configDir());
			mkdirSync(path.dirname(plaintextPath), { recursive: true });
			writeFileSync(
				plaintextPath,
				[
					'oauth_token = "plaintext-token"',
					'refresh_token = "plaintext-refresh"',
					'expiration_time = "2099-01-01T00:00:00.000Z"',
					'scopes = ["account:read"]',
				].join("\n")
			);

			const keyProvider = new InMemoryKeyProvider();
			let migrationCalled = false;
			const store = new EncryptedFileCredentialStore(
				configDir(),
				keyProvider,
				() => {
					migrationCalled = true;
				}
			);

			expect(store.read()).toEqual({
				oauth_token: "plaintext-token",
				refresh_token: "plaintext-refresh",
				expiration_time: "2099-01-01T00:00:00.000Z",
				scopes: ["account:read"],
			});

			expect(existsSync(plaintextPath)).toBe(false);
			expect(existsSync(getEncryptedAuthConfigFilePath(configDir()))).toBe(
				true
			);
			expect(keyProvider.getKey()).toBeDefined();
			expect(migrationCalled).toBe(true);
		});

		it("does not migrate when an encrypted file already exists", ({
			expect,
		}) => {
			const keyProvider = new InMemoryKeyProvider();
			const store = new EncryptedFileCredentialStore(configDir(), keyProvider);
			store.write({ oauth_token: "encrypted-already" });

			// Now write a plaintext file with different content; the read should
			// prefer the encrypted file.
			writeFileSync(
				getAuthConfigFilePath(configDir()),
				'oauth_token = "stale-plaintext"'
			);

			expect(store.read()).toEqual({ oauth_token: "encrypted-already" });
		});

		it("write scrubs any pre-existing plaintext TOML file", ({ expect }) => {
			const plaintextPath = getAuthConfigFilePath(configDir());
			mkdirSync(path.dirname(plaintextPath), { recursive: true });
			writeFileSync(plaintextPath, 'oauth_token = "stale"');

			new EncryptedFileCredentialStore(
				configDir(),
				new InMemoryKeyProvider()
			).write(SAMPLE_CONFIG);
			expect(existsSync(plaintextPath)).toBe(false);
		});

		it("read returns undefined when the plaintext file is unparseable", ({
			expect,
		}) => {
			const plaintextPath = getAuthConfigFilePath(configDir());
			mkdirSync(path.dirname(plaintextPath), { recursive: true });
			writeFileSync(plaintextPath, "garbage = = =");
			const store = new EncryptedFileCredentialStore(
				configDir(),
				new InMemoryKeyProvider()
			);
			// Consistent with the other corruption-shaped paths on the
			// encrypted store: an unparseable plaintext file collapses to
			// "no usable data" (the next login regenerates the key and
			// re-encrypts cleanly). The unparseable file is left on
			// disk so the user can inspect it — we don't silently
			// delete data we couldn't read.
			expect(store.read()).toBeUndefined();
			expect(existsSync(plaintextPath)).toBe(true);
		});

		it("read throws when the plaintext file raises a genuine filesystem error", ({
			expect,
		}) => {
			// A directory at the plaintext path is present (so `read()`
			// attempts a migration) but unreadable as a file, so
			// `readFileSync` raises `EISDIR`. That genuine fs error must
			// propagate rather than be swallowed as "not logged in".
			const plaintextPath = getAuthConfigFilePath(configDir());
			mkdirSync(plaintextPath, { recursive: true });
			const store = new EncryptedFileCredentialStore(
				configDir(),
				new InMemoryKeyProvider()
			);
			expect(() => store.read()).toThrow();
		});
	});
});
