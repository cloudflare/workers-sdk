import { z } from "zod";
import { Response } from "../../../http";
import { afterNavigation, openPage } from "./page";
import { quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";

const length = z.union([z.string(), z.number()]).optional();

export const pdfSchema = quickActionOptions({
	pdfOptions: z
		.object({
			scale: z.number().min(0.1).max(2).optional(),
			displayHeaderFooter: z.boolean().optional(),
			headerTemplate: z.string().optional(),
			footerTemplate: z.string().optional(),
			printBackground: z.boolean().optional(),
			landscape: z.boolean().optional(),
			pageRanges: z.string().optional(),
			format: z
				.enum([
					"letter",
					"legal",
					"tabloid",
					"ledger",
					"a0",
					"a1",
					"a2",
					"a3",
					"a4",
					"a5",
					"a6",
				])
				.optional()
				.default("letter"),
			width: length,
			height: length,
			preferCSSPageSize: z.boolean().optional(),
			margin: z
				.object({
					top: length,
					right: length,
					bottom: length,
					left: length,
				})
				.optional(),
			omitBackground: z.boolean().optional(),
			tagged: z.boolean().optional(),
			outline: z.boolean().optional(),
			timeout: z.number().optional(),
		})
		.prefault({}),
});

export async function pdf({
	context,
	options,
}: QuickActionContext<typeof pdfSchema>): Promise<Response> {
	const { page } = await openPage(context, options);
	await afterNavigation(page, options);
	return new Response(await page.pdf(options.pdfOptions), {
		headers: { "content-type": "application/pdf" },
	});
}
