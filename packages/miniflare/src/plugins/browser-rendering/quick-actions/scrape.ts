import { z } from "zod";
import { Response } from "../../../http";
import { openPage, pageMeta } from "./page";
import { scrapeElements } from "./page-functions";
import { addIssue, quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";

export const scrapeSchema = quickActionOptions(
	{
		elements: z
			.array(z.object({ selector: z.string() }))
			.min(1)
			.optional(),
	},
	(data, ctx) => {
		if (data.elements === undefined) {
			addIssue(ctx, ["elements"], "elements is required");
		}
	}
);

export async function scrape({
	context,
	options,
}: QuickActionContext<typeof scrapeSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	const data = await page.evaluate(scrapeElements, options.elements ?? []);
	return Response.json({
		success: true,
		result: data,
		meta: pageMeta(response),
	});
}
