// TODO: auto-generate this file
import type {
	HttpOptions_Style,
	TlsOptions_Version,
	Worker_Binding_CryptoKey_Usage,
} from "./workerd.capnp.js";

export {
	HttpOptions_Style,
	TlsOptions_Version,
	Worker_Binding_CryptoKey_Usage,
} from "./workerd.capnp.js";

export const kVoid = Symbol("kVoid");
export type Void = typeof kVoid;

export interface Config {
	services?: Service[];
	sockets?: Socket[];
}

export type Socket = {
	name?: string;
	address?: string;
	service?: ServiceDesignator;
} & ({ http?: HttpOptions } | { https?: Socket_Https });

export interface Socket_Https {
	options?: HttpOptions;
	tlsOptions?: TlsOptions;
}

export type Service = {
	name?: string;
} & (
	| { worker?: Worker }
	| { network?: Network }
	| { external?: ExternalServer }
	| { disk?: DiskDirectory }
);

export interface ServiceDesignator {
	name?: string;
	entrypoint?: string;
}

export type Worker = (
	| { modules?: Worker_Module[] }
	| { serviceWorkerScript?: string }
	| { inherit?: string }
) & {
	compatibilityDate?: string;
	compatibilityFlags?: string[];
	bindings?: Worker_Binding[];
	globalOutbound?: ServiceDesignator;
	cacheApiOutbound?: ServiceDesignator;
	durableObjectNamespaces?: Worker_DurableObjectNamespace[];
	durableObjectUniqueKeyModifier?: string;
	durableObjectStorage?: Worker_DurableObjectStorage;
};

export type Worker_DurableObjectStorage = { none?: Void } | { inMemory?: Void };

export type Worker_Module = {
	name?: string;
} & (
	| { esModule?: string }
	| { commonJsModule?: string }
	| { text?: string }
	| { data?: Uint8Array }
	| { wasm?: Uint8Array }
	| { json?: string }
);

export type Worker_Binding = {
	name?: string;
} & (
	| { parameter?: Worker_Binding_Parameter }
	| { text?: string }
	| { data?: Uint8Array }
	| { json?: string }
	| { wasmModule?: Uint8Array }
	| { cryptoKey?: Worker_Binding_CryptoKey }
	| { service?: ServiceDesignator }
	| { durableObjectNamespace?: Worker_Binding_DurableObjectNamespaceDesignator }
	| { kvNamespace?: ServiceDesignator }
	| { r2Bucket?: ServiceDesignator }
	| { r2Admin?: ServiceDesignator }
);

export interface Worker_Binding_Parameter {
	type?: Worker_Binding_Type;
	optional?: boolean;
}

export type Worker_Binding_Type =
	| { text?: Void }
	| { data?: Void }
	| { json?: Void }
	| { wasm?: Void }
	| { cryptoKey?: Worker_Binding_CryptoKey_Usage[] }
	| { service?: Void }
	| { durableObjectNamespace: Void }
	| { kvNamespace?: Void }
	| { r2Bucket?: Void }
	| { r2Admin?: Void };

export type Worker_Binding_DurableObjectNamespaceDesignator = {
	className?: string;
	serviceName?: string;
};

export type Worker_Binding_CryptoKey = (
	| { raw?: Uint8Array }
	| { hex?: string }
	| { base64?: string }
	| { pkcs8?: string }
	| { spki?: string }
	| { jwk?: string }
) & {
	algorithm?: Worker_Binding_CryptoKey_Algorithm;
	extractable?: boolean;
	usages?: Worker_Binding_CryptoKey_Usage[];
};

export type Worker_Binding_CryptoKey_Algorithm =
	| { name?: string }
	| { json?: string };

export type Worker_DurableObjectNamespace = { className?: string } & (
	| { uniqueKey?: string }
	| { ephemeralLocal?: Void }
);

export type ExternalServer = { address?: string } & (
	| { http: HttpOptions }
	| { https: ExternalServer_Https }
);

export interface ExternalServer_Https {
	options?: HttpOptions;
	tlsOptions?: TlsOptions;
	certificateHost?: string;
}

export interface Network {
	allow?: string[];
	deny?: string[];
	tlsOptions?: TlsOptions;
}

export interface DiskDirectory {
	path?: string;
	writable?: boolean;
}

export interface HttpOptions {
	style?: HttpOptions_Style;
	forwardedProtoHeader?: string;
	cfBlobHeader?: string;
	injectRequestHeaders?: HttpOptions_Header[];
	injectResponseHeaders?: HttpOptions_Header[];
}

export interface HttpOptions_Header {
	name?: string;
	value?: string;
}

export interface TlsOptions {
	keypair?: TlsOptions_Keypair;
	requireClientCerts?: boolean;
	trustBrowserCas?: boolean;
	trustedCertificates?: string[];
	minVersion?: TlsOptions_Version;
	cipherList?: string;
}

export interface TlsOptions_Keypair {
	privateKey?: string;
	certificateChain?: string;
}
