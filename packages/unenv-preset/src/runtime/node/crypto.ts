// Node.js exposes createCipher, createDecipher, pseudoRandomBytes only via the default export 🤷🏼‍♂️
// so extract it separately from the other exports
import {
	Cipher,
	Cipheriv,
	constants,
	createCipher,
	createCipheriv,
	createDecipher,
	createDecipheriv,
	createECDH,
	createSign,
	createVerify,
	Decipher,
	Decipheriv,
	diffieHellman,
	ECDH,
	getCipherInfo,
	hash,
	privateDecrypt,
	privateEncrypt,
	pseudoRandomBytes,
	publicDecrypt,
	publicEncrypt,
	Sign,
	sign,
	webcrypto as unenvCryptoWebcrypto,
	Verify,
	verify,
} from "unenv/node/crypto";
import type nodeCrypto from "node:crypto";

export {
	Cipher,
	Cipheriv,
	Decipher,
	Decipheriv,
	ECDH,
	Sign,
	Verify,
	constants,
	createCipheriv,
	createDecipheriv,
	createECDH,
	createSign,
	createVerify,
	diffieHellman,
	getCipherInfo,
	hash,
	privateDecrypt,
	privateEncrypt,
	publicDecrypt,
	publicEncrypt,
	sign,
	verify,
} from "unenv/node/crypto";

const workerdCrypto = process.getBuiltinModule("node:crypto");

// TODO: Ideally this list is not hardcoded but instead is generated when the preset is being generated in the `env()` call
//       This generation should use information from https://github.com/cloudflare/workerd/issues/2097
export const {
	Certificate,
	DiffieHellman,
	DiffieHellmanGroup,
	Hash,
	Hmac,
	KeyObject,
	X509Certificate,
	checkPrime,
	checkPrimeSync,
	createDiffieHellman,
	createDiffieHellmanGroup,
	createHash,
	createHmac,
	createPrivateKey,
	createPublicKey,
	createSecretKey,
	generateKey,
	generateKeyPair,
	generateKeyPairSync,
	generateKeySync,
	generatePrime,
	generatePrimeSync,
	getCiphers,
	getCurves,
	getDiffieHellman,
	getFips,
	getHashes,
	hkdf,
	hkdfSync,
	pbkdf2,
	pbkdf2Sync,
	randomBytes,
	randomFill,
	randomFillSync,
	randomInt,
	randomUUID,
	scrypt,
	scryptSync,
	secureHeapUsed,
	setEngine,
	setFips,
	subtle,
	timingSafeEqual,
} = workerdCrypto;

// Special case getRandomValues as it must be bound to the webcrypto object
export const getRandomValues = workerdCrypto.getRandomValues.bind(
	workerdCrypto.webcrypto
);

export const webcrypto = {
	// @ts-expect-error unenv has unknown type
	CryptoKey: unenvCryptoWebcrypto.CryptoKey,
	getRandomValues,
	randomUUID,
	subtle,
} satisfies typeof nodeCrypto.webcrypto;

// Node.js exposes fips only via the default export 🤷🏼‍♂️
// so extract it separately from the other exports
const fips = workerdCrypto.fips;

export default {
	/**
	 * manually unroll unenv-polyfilled-symbols to make it tree-shakeable
	 */
	Certificate,
	Cipher,
	Cipheriv,
	Decipher,
	Decipheriv,
	ECDH,
	Sign,
	Verify,
	X509Certificate,
	// @ts-expect-error @types/node is out of date - this is a bug in typings
	constants,
	// @ts-expect-error unenv has unknown type
	createCipheriv,
	// @ts-expect-error unenv has unknown type
	createDecipheriv,
	// @ts-expect-error unenv has unknown type
	createECDH,
	// @ts-expect-error unenv has unknown type
	createSign,
	// @ts-expect-error unenv has unknown type
	createVerify,
	// @ts-expect-error unenv has unknown type
	diffieHellman,
	// @ts-expect-error unenv has unknown type
	getCipherInfo,
	// @ts-expect-error unenv has unknown type
	hash,
	// @ts-expect-error unenv has unknown type
	privateDecrypt,
	// @ts-expect-error unenv has unknown type
	privateEncrypt,
	// @ts-expect-error unenv has unknown type
	publicDecrypt,
	// @ts-expect-error unenv has unknown type
	publicEncrypt,
	scrypt,
	scryptSync,
	// @ts-expect-error unenv has unknown type
	sign,
	// @ts-expect-error unenv has unknown type
	verify,

	// default-only export from unenv
	// @ts-expect-error unenv has unknown type
	createCipher,
	// @ts-expect-error unenv has unknown type
	createDecipher,
	// @ts-expect-error unenv has unknown type
	pseudoRandomBytes,

	/**
	 * manually unroll workerd-polyfilled-symbols to make it tree-shakeable
	 */
	DiffieHellman,
	DiffieHellmanGroup,
	Hash,
	Hmac,
	KeyObject,
	checkPrime,
	checkPrimeSync,
	createDiffieHellman,
	createDiffieHellmanGroup,
	createHash,
	createHmac,
	createPrivateKey,
	createPublicKey,
	createSecretKey,
	generateKey,
	generateKeyPair,
	generateKeyPairSync,
	generateKeySync,
	generatePrime,
	generatePrimeSync,
	getCiphers,
	getCurves,
	getDiffieHellman,
	getFips,
	getHashes,
	getRandomValues,
	hkdf,
	hkdfSync,
	pbkdf2,
	pbkdf2Sync,
	randomBytes,
	randomFill,
	randomFillSync,
	randomInt,
	randomUUID,
	secureHeapUsed,
	setEngine,
	setFips,
	subtle,
	timingSafeEqual,

	// default-only export from workerd
	fips,

	// special-cased deep merged symbols
	webcrypto,
} satisfies typeof nodeCrypto;
