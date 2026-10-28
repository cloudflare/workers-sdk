import { z } from "zod";
import { Response } from "../../../http";
import { afterNavigation, openPage, withStepTimeout } from "./page";
import { scrollThroughPage } from "./page-functions";
import { addIssue, quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";
import type { Page } from "@cloudflare/puppeteer";

export const screenshotOptionsShape = {
	optimizeForSpeed: z.boolean().optional(),
	encoding: z
		.union([z.literal("binary"), z.literal("base64")])
		.default("binary"),
	type: z
		.union([z.literal("png"), z.literal("jpeg"), z.literal("webp")])
		.default("png"),
	fullPage: z.boolean().optional(),
	clip: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number(),
			scale: z.number().optional(),
		})
		.optional(),
	quality: z.number().optional(),
	omitBackground: z.boolean().optional(),
	captureBeyondViewport: z.boolean().optional(),
	fromSurface: z.boolean().optional(),
};

export const screenshotSchema = quickActionOptions(
	{
		scrollPage: z.boolean().optional(),
		selector: z.string().optional(),
		screenshotOptions: z.object(screenshotOptionsShape).prefault({}),
	},
	(data, ctx) => {
		const options = data.screenshotOptions as z.output<
			z.ZodObject<typeof screenshotOptionsShape>
		>;
		if (options.clip && options.fullPage) {
			addIssue(
				ctx,
				["screenshotOptions"],
				"screenshotOptions.clip and screenshotOptions.fullPage can't be set at the same time."
			);
		}
		if (options.type === "png" && options.quality !== undefined) {
			addIssue(
				ctx,
				["screenshotOptions", "quality"],
				"screenshotOptions.quality cannot be set when type is 'png'."
			);
		}
	}
);

export async function screenshot({
	context,
	options,
}: QuickActionContext<typeof screenshotSchema>): Promise<Response> {
	const { page } = await openPage(context, options);
	await afterNavigation(page, options);
	if (options.scrollPage) {
		await page.evaluate(scrollThroughPage, options.viewport.height);
	}
	const { screenshotOptions } = options;
	const target: Pick<Page, "screenshot"> | null = options.selector
		? await page.$(options.selector)
		: page;
	if (target === null) {
		throw new TypeError(
			"Cannot read properties of null (reading 'screenshot')"
		);
	}
	const image = await withStepTimeout(
		options,
		target.screenshot({ ...screenshotOptions, encoding: "base64" }),
		"Screenshot"
	);
	const mimeType = `image/${screenshotOptions.type}`;
	return screenshotOptions.encoding === "base64"
		? new Response(`data:${mimeType};base64,${image}`)
		: new Response(Buffer.from(image, "base64"), {
				headers: { "content-type": mimeType },
			});
}
