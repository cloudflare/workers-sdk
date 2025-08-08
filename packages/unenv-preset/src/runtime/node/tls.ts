import {
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	createSecurePair,
	createServer,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	getCiphers,
	rootCertificates,
	Server,
} from "unenv/node/tls";
import type nodeTls from "node:tls";

export {
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	createSecurePair,
	createServer,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	getCiphers,
	rootCertificates,
	Server,
} from "unenv/node/tls";

const workerdTls = process.getBuiltinModule("node:tls");

// Natively implemented in workerd
export const {
	checkServerIdentity,
	connect,
	createSecureContext,
	// @ts-expect-error @types/node does not provide this function
	convertALPNProtocols,
	// @ts-expect-error Node typings wrongly declare `SecureContext` as an interface
	SecureContext,
	TLSSocket,
} = workerdTls;

export default {
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	DEFAULT_CIPHERS,
	DEFAULT_ECDH_CURVE,
	DEFAULT_MAX_VERSION,
	DEFAULT_MIN_VERSION,
	// @ts-expect-error Node types do not match unenv
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
