import {
	constructHeaders,
	constructRedirects,
} from "@cloudflare/workers-shared/utils/configuration/constructConfiguration";
import { ANALYTICS_VERSION } from "./constants";
import type { Metadata } from "./types";
import type {
	Logger,
	ParsedHeaders,
	ParsedRedirects,
} from "@cloudflare/workers-shared/utils/configuration/types";

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
	// @ts-expect-error This error appeared when fixing type imports, but I didn't want to change actual behavior
	return {
		...constructRedirects({ redirects, redirectsFile, logger }),
		...constructHeaders({ headers, headersFile, logger }),
		...constructWebAnalytics({ webAnalyticsToken, logger }),
		deploymentId,
		failOpen,
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
