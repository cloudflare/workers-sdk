import { relative } from "node:path";
import {
	ANALYTICS_VERSION,
	HEADERS_VERSION,
	PLACEHOLDER_REGEX,
	REDIRECTS_VERSION,
	SPLAT_REGEX,
} from "./constants";
import type { MetadataStaticRedirects } from "../asset-server/metadata";
import type {
	Logger,
	Metadata,
	MetadataHeaderEntry,
	MetadataHeaders,
	MetadataRedirects,
	ParsedHeaders,
	ParsedRedirects,
} from "./types";

const noopLogger = {
	debug: (_message: string) => {},
	log: (_message: string) => {},
	info: (_message: string) => {},
	warn: (_message: string) => {},
	error: (_error: Error) => {},
};

export function createMetadataObject({
	redirects,
	headers,
	redirectsFile,
	headersFile,
	webAnalyticsToken,
	deploymentId,
	failOpen,
	logger = noopLogger,
}: {
	redirects?: ParsedRedirects;
	headers?: ParsedHeaders;
	redirectsFile?: string;
	headersFile?: string;
	webAnalyticsToken?: string;
	deploymentId?: string;
	failOpen?: boolean;
	logger?: Logger;
}): Metadata {
	return {
		...constructRedirects({ redirects, redirectsFile, logger }),
		...constructHeaders({ headers, headersFile, logger }),
		...constructWebAnalytics({ webAnalyticsToken, logger }),
		deploymentId,
		failOpen,
	};
}

function constructRedirects({
	redirects,
	redirectsFile,
	logger,
}: {
	redirects?: ParsedRedirects;
	redirectsFile?: string;
	logger: Logger;
}): Metadata {
	if (!redirects) {
		return {};
	}

	const num_valid = redirects.rules.length;
	const num_invalid = redirects.invalid.length;

	// exhaustive check, since we could not have parsed `redirects` out of
	// a non-existing redirects file
	const redirectsRelativePath = redirectsFile
		? relative(process.cwd(), redirectsFile)
		: "";

	logger.log(
		`✨ Parsed ${num_valid} valid redirect rule${num_valid === 1 ? "" : "s"}.`
	);

	if (num_invalid > 0) {
		let invalidRedirectRulesList = ``;

		for (const { line, lineNumber, message } of redirects.invalid) {
			invalidRedirectRulesList += `▶︎ ${message}\n`;

			if (line) {
				invalidRedirectRulesList += `    at ${redirectsRelativePath}${lineNumber ? `:${lineNumber}` : ""} | ${line}\n\n`;
			}
		}

		logger.warn(
			`Found ${num_invalid} invalid redirect rule${num_invalid === 1 ? "" : "s"}:\n` +
				`${invalidRedirectRulesList}`
		);
	}

	/* Better to return no Redirects object at all than one with empty rules */
	if (num_valid === 0) {
		return {};
	}

	const staticRedirects: MetadataStaticRedirects = {};
	const dynamicRedirects: MetadataRedirects = {};
	let canCreateStaticRule = true;
	for (const rule of redirects.rules) {
		if (!rule.from.match(SPLAT_REGEX) && !rule.from.match(PLACEHOLDER_REGEX)) {
			if (canCreateStaticRule) {
				staticRedirects[rule.from] = {
					status: rule.status,
					to: rule.to,
					lineNumber: rule.lineNumber,
				};
				continue;
			} else {
				logger.info(
					`The redirect rule ${rule.from} → ${rule.status} ${rule.to} could be made more performant by bringing it above any lines with splats or placeholders.`
				);
			}
		}

		dynamicRedirects[rule.from] = { status: rule.status, to: rule.to };
		canCreateStaticRule = false;
	}

	return {
		redirects: {
			version: REDIRECTS_VERSION,
			staticRules: staticRedirects,
			rules: dynamicRedirects,
		},
	};
}

function constructHeaders({
	headers,
	headersFile,
	logger,
}: {
	headers?: ParsedHeaders;
	headersFile?: string;
	logger: Logger;
}): Metadata {
	if (!headers) {
		return {};
	}

	const num_valid = headers.rules.length;
	const num_invalid = headers.invalid.length;

	// exhaustive check, since we could not have parsed `headers` out of
	// a non-existing headers file
	const headersRelativePath = headersFile
		? relative(process.cwd(), headersFile)
		: "";

	logger.log(
		`✨ Parsed ${num_valid} valid header rule${num_valid === 1 ? "" : "s"}.`
	);

	if (num_invalid > 0) {
		let invalidHeaderRulesList = ``;

		for (const { line, lineNumber, message } of headers.invalid) {
			invalidHeaderRulesList += `▶︎ ${message}\n`;

			if (line) {
				invalidHeaderRulesList += `    at ${headersRelativePath}${lineNumber ? `:${lineNumber}` : ""} | ${line}\n\n`;
			}
		}

		logger.warn(
			`Found ${num_invalid} invalid header rule${num_invalid === 1 ? "" : "s"}:\n` +
				`${invalidHeaderRulesList}`
		);
	}

	/* Better to return no Headers object at all than one with empty rules */
	if (num_valid === 0) {
		return {};
	}

	const rules: MetadataHeaders = {};
	for (const rule of headers.rules) {
		const entry: MetadataHeaderEntry = {};

		if (Object.keys(rule.headers).length) {
			entry.set = rule.headers;
		}
		if (rule.unsetHeaders.length) {
			entry.unset = rule.unsetHeaders;
		}

		rules[rule.path] = entry;
	}

	return {
		headers: {
			version: HEADERS_VERSION,
			rules,
		},
	};
}

function constructWebAnalytics({
	webAnalyticsToken,
}: {
	webAnalyticsToken?: string;
	logger: Logger;
}) {
	if (!webAnalyticsToken) {
		return {};
	}

	return {
		analytics: {
			version: ANALYTICS_VERSION,
			token: webAnalyticsToken,
		},
	};
}
