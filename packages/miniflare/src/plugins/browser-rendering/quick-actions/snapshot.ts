import { z } from "zod";
import { Response } from "../../../http";
import { readForMarkdown, toMarkdown } from "./markdown";
import { afterNavigation, openPage, pageMeta, withStepTimeout } from "./page";
import { addIssue, quickActionOptions } from "./schemas";
import { screenshotOptionsShape } from "./screenshot";
import type { QuickActionContext } from "./page";

const { encoding: _encoding, ...snapshotScreenshotOptionsShape } =
	screenshotOptionsShape;

export const snapshotSchema = quickActionOptions(
	{
		screenshotOptions: z.object(snapshotScreenshotOptionsShape).optional(),
		formats: z
			.array(z.enum(["content", "screenshot", "markdown", "accessibilityTree"]))
			.default(["content", "screenshot"]),
	},
	(data, ctx) => {
		if (new Set(data.formats as string[]).size < 2) {
			addIssue(
				ctx,
				["formats"],
				"This format must be combined with at least one other format. Use respective endpoint for this format request."
			);
		}
	}
);

export async function snapshot({
	context,
	options,
}: QuickActionContext<typeof snapshotSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	await afterNavigation(page, options);
	const formats = new Set(options.formats);
	const screenshot = formats.has("screenshot")
		? await withStepTimeout(
				options,
				page.screenshot({ ...options.screenshotOptions, encoding: "base64" }),
				"Screenshot"
			)
		: undefined;
	const accessibilityTree = formats.has("accessibilityTree")
		? await withStepTimeout(
				options,
				page.accessibility.snapshot(),
				"Accessibility tree"
			)
		: undefined;
	const content = formats.has("content")
		? await withStepTimeout(options, page.content(), "Content")
		: undefined;
	const markdownContent = formats.has("markdown")
		? await withStepTimeout(options, readForMarkdown(page), "Content")
		: undefined;
	const meta = pageMeta(response, await page.title());
	return Response.json({
		success: true,
		result: {
			...(formats.has("content") ? { content } : {}),
			...(formats.has("accessibilityTree") ? { accessibilityTree } : {}),
			...(formats.has("screenshot") ? { screenshot } : {}),
			...(markdownContent !== undefined
				? { markdown: toMarkdown(markdownContent, meta, options) }
				: {}),
		},
		meta,
	});
}
