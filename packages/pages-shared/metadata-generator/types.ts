/* REDIRECT PARSING TYPES */

export type RedirectLine = [from: string, to: string, status?: number];
export type RedirectRule = {
	from: string;
	to: string;
	status: number;
	lineNumber: number;
};

export type Headers = Record<string, string>;
export type HeadersRule = {
	path: string;
	headers: Headers;
	unsetHeaders: string[];
};

export type InvalidRedirectRule = {
	line?: string;
	lineNumber?: number;
	message: string;
};

export type InvalidHeadersRule = {
	line?: string;
	lineNumber?: number;
	message: string;
};

export type ParsedRedirects = {
	invalid: InvalidRedirectRule[];
	rules: RedirectRule[];
};

/** Parsed redirects and input file */
export type ParsedRedirectsWithFile = {
	parsedRedirects?: ParsedRedirects;
	file?: string;
};

export type ParsedHeaders = {
	invalid: InvalidHeadersRule[];
	rules: HeadersRule[];
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

export type Logger = (message: string) => void;
