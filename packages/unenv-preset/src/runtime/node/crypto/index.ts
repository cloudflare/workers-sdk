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
} from "unenv/runtime/node/crypto/index";
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
} from "unenv/runtime/node/crypto/index";

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
	scrypt,
	scryptSync,
	sign,
	verify,

	// default-only export from unenv
	createCipher,
	createDecipher,
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
