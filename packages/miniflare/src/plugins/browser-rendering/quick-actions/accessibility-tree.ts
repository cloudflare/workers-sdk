import { z } from "zod";
import { Response } from "../../../http";
import { afterNavigation, openPage, pageMeta, withStepTimeout } from "./page";
import { quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";

export const accessibilityTreeSchema = quickActionOptions({
	interestingOnly: z.boolean().optional(),
	root: z.string().optional(),
});

export async function accessibilityTree({
	context,
	options,
}: QuickActionContext<typeof accessibilityTreeSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	await afterNavigation(page, options);
	const root = options.root ? await page.$(options.root) : undefined;
	// Puppeteer would snapshot the whole page for an unmatched root
	const tree =
		root === null
			? null
			: await withStepTimeout(
					options,
					page.accessibility.snapshot({
						interestingOnly: options.interestingOnly ?? root === undefined,
						root,
					}),
					"Accessibility tree"
				);
	return Response.json({
		success: true,
		result: { accessibilityTree: tree },
		meta: pageMeta(response, await page.title()),
	});
}
