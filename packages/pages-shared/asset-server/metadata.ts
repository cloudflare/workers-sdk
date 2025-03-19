// TODO: Use types from metadata-generator instead

export type MetadataStaticRedirectEntry = {
	status: number;
	to: string;
	lineNumber: number;
};

export type MetadataRedirectEntry = {
	status: number;
	to: string;
	lineNumber?: number;
};

export type MetadataStaticRedirects = {
	[path: string]: MetadataStaticRedirectEntry;
};

export type MetadataRedirects = {
	[path: string]: MetadataRedirectEntry;
};

// v1 Types
export type MetadataHeadersEntries = Record<string, string>;

export type MetadataHeadersRulesV1 = {
	[path: string]: MetadataHeadersEntries;
};

export type MetadataHeadersV1 = {
	version: number; // TODO: This could be 1
	rules: MetadataHeadersRulesV1;
};

// v2 Types
export type SetHeaders = MetadataHeadersEntries;

export type UnsetHeaders = Array<string>;

export type MetadataHeadersRulesV2 = {
	[path: string]: MetadataHeaderEntry;
};

export type MetadataHeaderEntry = {
	set?: SetHeaders;
	unset?: UnsetHeaders;
};

export type MetadataHeadersV2 = {
	version: number; // TODO: This could be 2
	rules: MetadataHeadersRulesV2;
};

export type Metadata = {
	redirects?: {
		version: number;
		staticRules?: MetadataStaticRedirects;
		rules: MetadataRedirects;
	};
	headers?: MetadataHeadersV1 | MetadataHeadersV2;
	analytics?: {
		version: number;
		token: string;
	};
	deploymentId?: string;
	failOpen?: boolean;
};
