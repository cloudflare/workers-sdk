import {
	checkServerIdentity,
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	convertALPNProtocols,
	createSecurePair,
	createServer,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	getCiphers,
	rootCertificates,
	SecureContext,
	Server,
} from "unenv/node/tls";
import type nodeTls from "node:tls";

export {
	checkServerIdentity,
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	convertALPNProtocols,
	createSecurePair,
	createServer,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	getCiphers,
	rootCertificates,
	SecureContext,
	Server,
} from "unenv/node/tls";

const workerdTls = process.getBuiltinModule("node:tls");

// Natively implemented in workerd
export const { connect, TLSSocket } = workerdTls;

// `connect` implementation only supports a default SecureContext for now.
export const createSecureContext: typeof nodeTls.createSecureContext = (
	options?: nodeTls.SecureContextOptions
) => {
	const keys: (keyof nodeTls.SecureContextOptions)[] = [
		"ALPNCallback",
		"allowPartialTrustChain",
		"ca",
		"cert",
		"sigalgs",
		"ciphers",
		"clientCertEngine",
		"crl",
		"dhparam",
		"ecdhCurve",
		"honorCipherOrder",
		"key",
		"privateKeyEngine",
		"privateKeyIdentifier",
		"maxVersion",
		"minVersion",
		"passphrase",
		"pfx",
		"secureOptions",
		"secureProtocol",
		"ticketKeys",
		"sessionTimeout",
	];

	for (const k of keys) {
		if (options?.[k] != undefined) {
			throw new Error("createSecureContext only supports default options.");
		}
	}
	return {
		context: undefined,
	};
};

export default {
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	// @ts-expect-error
	SecureContext,
	Server,
	TLSSocket,
	checkServerIdentity,
	connect,
	convertALPNProtocols,
	createSecureContext,
	createSecurePair,
	createServer,
	getCiphers,
	rootCertificates,
} satisfies typeof nodeTls;
