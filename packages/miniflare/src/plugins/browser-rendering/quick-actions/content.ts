import { Response } from "../../../http";
import { afterNavigation, openPage, pageMeta, withStepTimeout } from "./page";
import type { QuickActionContext } from "./page";
import type { commonOptionsSchema } from "./schemas";

export async function content({
	context,
	options,
}: QuickActionContext<typeof commonOptionsSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	await afterNavigation(page, options);
	const html = await withStepTimeout(options, page.content(), "Content");
	const meta = pageMeta(response, await page.title());
	return Response.json({ success: true, result: html, meta });
}
