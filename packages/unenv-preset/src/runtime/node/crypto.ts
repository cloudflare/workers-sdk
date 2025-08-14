// Node.js exposes createCipher, createDecipher, pseudoRandomBytes only via the default export 🤷🏼‍♂️
// so extract it separately from the other exports
import {
	Cipher,
	createCipher,
	createDecipher,
	Decipher,
	pseudoRandomBytes,
	webcrypto as unenvCryptoWebcrypto,
} from "unenv/node/crypto";
import type nodeCrypto from "node:crypto";

export { Cipher, Decipher } from "unenv/node/crypto";

const workerdCrypto = process.getBuiltinModule("node:crypto");

export const {
	Certificate,
	checkPrime,
	checkPrimeSync,
	constants,
	// @ts-expect-error  Node types do not match unenv
	Cipheriv,
	createCipheriv,
	createDecipheriv,
	createDiffieHellman,
	createDiffieHellmanGroup,
	createECDH,
	createHash,
	createHmac,
	createPrivateKey,
	createPublicKey,
	createSecretKey,
	createSign,
	createVerify,
	// @ts-expect-error  Node types do not match unenv
	Decipheriv,
	diffieHellman,
	DiffieHellman,
	DiffieHellmanGroup,
	ECDH,
	fips,
	generateKey,
	generateKeyPair,
	generateKeyPairSync,
	generateKeySync,
	generatePrime,
	generatePrimeSync,
	getCipherInfo,
	getCiphers,
	getCurves,
	getDiffieHellman,
	getFips,
	getHashes,
	getRandomValues,
	hash,
	Hash,
	hkdf,
	hkdfSync,
	Hmac,
	KeyObject,
	pbkdf2,
	pbkdf2Sync,
	privateDecrypt,
	privateEncrypt,
	publicDecrypt,
	publicEncrypt,
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
	sign,
	Sign,
	subtle,
	timingSafeEqual,
	verify,
	Verify,
	X509Certificate,
} = workerdCrypto;

// See https://github.com/cloudflare/workerd/issues/3751
export const webcrypto = {
	// @ts-expect-error Node types do not match unenv
	CryptoKey: unenvCryptoWebcrypto.CryptoKey,
	getRandomValues,
	randomUUID,
	subtle,
} satisfies typeof nodeCrypto.webcrypto;

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
