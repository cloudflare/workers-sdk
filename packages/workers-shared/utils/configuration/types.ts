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

export type ParsedHeaders = {
	invalid: InvalidHeadersRule[];
	rules: HeadersRule[];
};

export interface Logger {
	debug: (message: string) => void;
	log: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (error: Error) => void;
}
