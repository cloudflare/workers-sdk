import {
	checkServerIdentity,
	CLIENT_RENEG_LIMIT,
	CLIENT_RENEG_WINDOW,
	convertALPNProtocols,
	createSecureContext,
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
	createSecureContext,
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
