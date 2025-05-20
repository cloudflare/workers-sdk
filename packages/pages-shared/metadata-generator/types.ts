import type {
	ParsedHeaders,
	ParsedRedirects,
} from "@cloudflare/workers-shared/utils/configuration/types";

export type ParsedRedirectsWithFile = {
	parsedRedirects?: ParsedRedirects;
	file?: string;
};

/** Parsed headers and input file */
export type ParsedHeadersWithFile = {
	parsedHeaders?: ParsedHeaders;
	file?: string;
};

/* METADATA TYPES*/

export type MetadataRedirectEntry = {
	status: number;
	to: string;
};

export type MetadataRedirects = {
	[path: string]: MetadataRedirectEntry;
};

export type MetadataHeaders = {
	[path: string]: MetadataHeaderEntry;
};

export type MetadataHeaderEntry = {
	set?: Record<string, string>;
	unset?: Array<string>;
};

export type Metadata = {
	redirects?: {
		version: number;
		staticRules: MetadataRedirects;
		rules: MetadataRedirects;
	};
	headers?: {
		version: number;
		rules: MetadataHeaders;
	};
	analytics?: {
		version: number;
		token: string;
	};
	deploymentId?: string;
	failOpen?: boolean;
};
