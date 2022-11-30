import {
	ANALYTICS_VERSION,
	REDIRECTS_VERSION,
	HEADERS_VERSION,
	SPLAT_REGEX,
	PLACEHOLDER_REGEX,
} from "./constants";
import type { MetadataStaticRedirects } from "../asset-server/metadata";
import type {
	Metadata,
	MetadataRedirects,
	MetadataHeaders,
	ParsedRedirects,
	ParsedHeaders,
	Logger,
} from "./types";

export function createMetadataObject({
	redirects,
	headers,
	webAnalyticsToken,
	deploymentId,
	failOpen,
	logger = (_message: string) => {},
}: {
	redirects?: ParsedRedirects;
	headers?: ParsedHeaders;
	webAnalyticsToken?: string;
	deploymentId?: string;
	failOpen?: boolean;
	logger?: Logger;
}): Metadata {
	return {
		...constructRedirects({ redirects, logger }),
		...constructHeaders({ headers, logger }),
		...constructWebAnalytics({ webAnalyticsToken, logger }),
		deploymentId,
		failOpen,
	};
}

function constructRedirects({
	redirects,
	logger,
}: {
	redirects?: ParsedRedirects;
	logger: Logger;
}): Metadata {
	if (!redirects) return {};

	const num_valid = redirects.rules.length;
	const num_invalid = redirects.invalid.length;

	logger(
		`Parsed ${num_valid} valid redirect rule${num_valid === 1 ? "" : "s"}.`
	);

	if (num_invalid > 0) {
		logger(`Found invalid redirect lines:`);
		for (const { line, lineNumber, message } of redirects.invalid) {
			if (line) logger(`  - ${lineNumber ? `#${lineNumber}: ` : ""}${line}`);
			logger(`    ${message}`);
		}
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
				logger(
					`Info: the redirect rule ${rule.from} → ${rule.status} ${rule.to} could be made more performant by bringing it above any lines with splats or placeholders.`
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
	logger,
}: {
	headers?: ParsedHeaders;
	logger: Logger;
}): Metadata {
	if (!headers) return {};

	const num_valid = headers.rules.length;
	const num_invalid = headers.invalid.length;

	logger(`Parsed ${num_valid} valid header rule${num_valid === 1 ? "" : "s"}.`);

	if (num_invalid > 0) {
		logger(`Found invalid header lines:`);
		for (const { line, lineNumber, message } of headers.invalid) {
			if (line) logger(`  - ${lineNumber ? `#${lineNumber}: ` : ""} ${line}`);
			logger(`    ${message}`);
		}
	}

	/* Better to return no Headers object at all than one with empty rules */
	if (num_valid === 0) {
		return {};
	}

	const rules: MetadataHeaders = {};
	for (const rule of headers.rules) {
		rules[rule.path] = {};

		if (Object.keys(rule.headers).length) {
			rules[rule.path].set = rule.headers;
		}
		if (rule.unsetHeaders.length) {
			rules[rule.path].unset = rule.unsetHeaders;
		}
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
	if (!webAnalyticsToken) return {};

	return {
		analytics: {
			version: ANALYTICS_VERSION,
			token: webAnalyticsToken,
		},
	};
}
