import { describe, it } from "vitest";
import {
	decryptString,
	encryptString,
	generateKey,
	parseEncryptedEnvelope,
} from "../../src/credential-store/crypto";

describe("crypto", () => {
	describe("generateKey", () => {
		it("returns 32 bytes", ({ expect }) => {
			expect(generateKey().length).toBe(32);
		});

		it("returns different bytes on every call", ({ expect }) => {
			const a = generateKey();
			const b = generateKey();
			// Probability of collision is 1 in 2^256.
			expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
		});
	});

	describe("encryptString → decryptString round-trip", () => {
		it("recovers the original plaintext", ({ expect }) => {
			const key = generateKey();
			const plaintext = "hello world";
			const envelope = encryptString(plaintext, key);
			expect(decryptString(envelope, key)).toBe(plaintext);
		});

		it("recovers a multi-line UTF-8 TOML-like payload", ({ expect }) => {
			const key = generateKey();
			const plaintext = [
				'oauth_token = "abc"',
				'refresh_token = "def"',
				'scopes = ["account:read", "user:read"]',
				'expiration_time = "2099-01-01T00:00:00.000Z"',
			].join("\n");
			const envelope = encryptString(plaintext, key);
			expect(decryptString(envelope, key)).toBe(plaintext);
		});

		it("works for an empty plaintext", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("", key);
			expect(decryptString(envelope, key)).toBe("");
		});

		it("produces a different IV on every call", ({ expect }) => {
			const key = generateKey();
			const ivs = new Set<string>();
			for (let i = 0; i < 32; i++) {
				ivs.add(encryptString("identical", key).iv);
			}
			// Birthday paradox at 32 samples × 96 bits IV ≈ 0 collisions expected.
			expect(ivs.size).toBe(32);
		});
	});

	describe("decryptString failure modes", () => {
		it("throws when the auth tag is wrong", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("hello", key);
			// Flip a single bit in the tag.
			const tampered = {
				...envelope,
				tag: Buffer.from(
					Buffer.from(envelope.tag, "base64").map((b, i) =>
						i === 0 ? b ^ 0x01 : b
					)
				).toString("base64"),
			};
			expect(() => decryptString(tampered, key)).toThrow();
		});

		it("throws when the ciphertext is tampered with", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("hello", key);
			const tampered = {
				...envelope,
				ciphertext: Buffer.from(
					Buffer.from(envelope.ciphertext, "base64").map((b, i) =>
						i === 0 ? b ^ 0x01 : b
					)
				).toString("base64"),
			};
			expect(() => decryptString(tampered, key)).toThrow();
		});

		it("throws when the wrong key is used", ({ expect }) => {
			const k1 = generateKey();
			const k2 = generateKey();
			const envelope = encryptString("hello", k1);
			expect(() => decryptString(envelope, k2)).toThrow();
		});

		it("throws on an unsupported envelope version", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("hello", key);
			const futureVersion = { ...envelope, v: 2 as 1 };
			expect(() => decryptString(futureVersion, key)).toThrow(
				/Unsupported encrypted envelope version/
			);
		});

		it("throws when the key is the wrong length", ({ expect }) => {
			const envelope = encryptString("hello", generateKey());
			const shortKey = new Uint8Array(16);
			expect(() => decryptString(envelope, shortKey)).toThrow(
				/requires a 32-byte key/
			);
		});

		it("throws when the IV length is wrong", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("hello", key);
			const truncatedIv = {
				...envelope,
				iv: Buffer.alloc(8).toString("base64"),
			};
			expect(() => decryptString(truncatedIv, key)).toThrow(
				/Expected 12-byte IV/
			);
		});

		it("throws when the auth tag length is wrong", ({ expect }) => {
			const key = generateKey();
			const envelope = encryptString("hello", key);
			const shortTag = {
				...envelope,
				tag: Buffer.alloc(12).toString("base64"),
			};
			expect(() => decryptString(shortTag, key)).toThrow(
				/Expected 16-byte auth tag/
			);
		});
	});

	describe("encryptString validation", () => {
		it("throws when the key is the wrong length", ({ expect }) => {
			expect(() => encryptString("hello", new Uint8Array(16))).toThrow(
				/requires a 32-byte key/
			);
		});
	});

	describe("parseEncryptedEnvelope", () => {
		it("returns the envelope when the input is well-formed", ({ expect }) => {
			const envelope = encryptString("hi", generateKey());
			expect(parseEncryptedEnvelope(envelope)).toEqual(envelope);
		});

		it("returns undefined for unknown version", ({ expect }) => {
			const envelope = encryptString("hi", generateKey());
			expect(parseEncryptedEnvelope({ ...envelope, v: 99 })).toBeUndefined();
		});

		it("returns undefined for missing fields", ({ expect }) => {
			expect(
				parseEncryptedEnvelope({ v: 1, alg: "AES-256-GCM" })
			).toBeUndefined();
		});

		it("returns undefined for non-object input", ({ expect }) => {
			expect(parseEncryptedEnvelope("nope")).toBeUndefined();
			expect(parseEncryptedEnvelope(null)).toBeUndefined();
			expect(parseEncryptedEnvelope(undefined)).toBeUndefined();
		});

		it("returns undefined when alg label is wrong", ({ expect }) => {
			const envelope = encryptString("hi", generateKey());
			expect(
				parseEncryptedEnvelope({ ...envelope, alg: "DES" })
			).toBeUndefined();
		});
	});
});
