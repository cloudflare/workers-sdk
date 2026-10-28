import { z } from "zod";
import { Response } from "../../../http";
import { openPage, pageMeta } from "./page";
import { baseHref, listHrefs } from "./page-functions";
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
	const pageUrl = options.url ? page.url() : await page.evaluate(baseHref);
	const meta = pageMeta(response);
	const unique = [
		...new Set(
			hrefs.filter((href): href is string => !!href && !href.startsWith("#"))
		),
	];
	if (!pageUrl) {
		return Response.json({ success: true, result: unique, meta });
	}
	const origin = new URL(pageUrl).origin;
	const resolved = unique.flatMap((href) => {
		if (!href.startsWith("/")) {
			return [href];
		}
		try {
			return [new URL(href, origin).toString()];
		} catch {
			return [];
		}
	});
	if (!options.excludeExternalLinks) {
		return Response.json({ success: true, result: resolved, meta });
	}
	const site = siteOf(new URL(options.url ?? pageUrl).hostname);
	const result = resolved.filter((link) => {
		try {
			return siteOf(new URL(link).hostname) === site;
		} catch {
			return false;
		}
	});
	return Response.json({ success: true, result, meta });
}

function siteOf(hostname: string): string {
	return hostname.split(".").slice(-2).join(".");
}
