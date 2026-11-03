import { z } from "zod";
import { Response } from "../../../http";
import { openPage, pageMeta } from "./page";
import { baseUri, listHrefs } from "./page-functions";
import { quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";

export const linksSchema = quickActionOptions({
	visibleLinksOnly: z.boolean().optional().default(false),
	excludeExternalLinks: z.boolean().optional().default(false),
});

export async function links({
	context,
	options,
}: QuickActionContext<typeof linksSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	const hrefs = await page.evaluate(listHrefs, options.visibleLinksOnly);
	// Pages without a host to resolve against, such as `html` without a <base>
	// or a data: URL, keep every link as written
	const base = hostedUrl(await page.evaluate(baseUri));
	const meta = pageMeta(response);
	const result = [
		...new Set(
			hrefs
				.filter((href): href is string => !!href && !href.startsWith("#"))
				.map((href) => (base ? resolveHref(href, base.href) : href))
		),
	];
	// The service compares links with the requested URL rather than the page it
	// redirected to, and keeps every link if that URL has no host
	const host = hostedUrl(options.url ?? base?.href)?.hostname;
	if (!options.excludeExternalLinks || host === undefined) {
		return Response.json({ success: true, result, meta });
	}
	const site = siteOf(host);
	return Response.json({
		success: true,
		result: result.filter(
			(link) => URL.canParse(link) && siteOf(new URL(link).hostname) === site
		),
		meta,
	});
}

/**
 * Resolves a link the way the service does.
 *
 * @param href The link's `href` attribute.
 * @param base The page's base URL.
 * @returns Absolute URLs and unresolvable links as written, and everything
 * else resolved against `base`.
 */
function resolveHref(href: string, base: string): string {
	if (URL.canParse(href) || !URL.canParse(href, base)) {
		return href;
	}
	return new URL(href, base).href;
}

function hostedUrl(url: string | undefined): URL | undefined {
	if (url === undefined || !URL.canParse(url)) {
		return undefined;
	}
	const parsed = new URL(url);
	return parsed.hostname ? parsed : undefined;
}

function siteOf(hostname: string): string {
	return hostname.split(".").slice(-2).join(".");
}
