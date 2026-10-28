import { htmlToMarkdown, initSync } from "mdream/wasm";
import mdreamWasm from "mdream/wasm/mdream_edge_bg.wasm";
import { Response } from "../../../http";
import { HtmlToMarkdownError } from "./errors";
import { afterNavigation, openPage, pageMeta, withStepTimeout } from "./page";
import { contentForMarkdown } from "./page-functions";
import type { PageMeta, QuickActionContext } from "./page";
import type { CommonOptions, commonOptionsSchema } from "./schemas";
import type { Page } from "@cloudflare/puppeteer";

initSync({ module: Buffer.from(mdreamWasm, "base64") });

const inline = { enter: "", exit: "", isInline: true };
const MDREAM_OPTIONS = {
	clean: { emptyLinkText: true, redundantLinks: true, selfLinkHeadings: true },
	frontmatter: true,
	tagOverrides: {
		ins: inline,
		u: inline,
		mark: inline,
		sup: inline,
		sub: inline,
		kbd: inline,
		dl: { enter: "", exit: "" },
		dt: { enter: "", exit: "  \n" },
		dd: { enter: "", exit: "\n\n" },
		details: { enter: "", exit: "" },
		summary: { enter: "", exit: "" },
		address: { enter: "", exit: "" },
	},
};

export function toMarkdown(
	html: string,
	meta: PageMeta,
	options: CommonOptions
): string {
	const url = meta.finalUrl ?? options.url;
	const origin = url && new URL(url).toString();
	try {
		return htmlToMarkdown(html, { ...MDREAM_OPTIONS, origin });
	} catch (error) {
		throw new HtmlToMarkdownError(
			error instanceof Error
				? error.message
				: "HTML to Markdown conversion failed"
		);
	}
}

export function readForMarkdown(page: Page): Promise<string> {
	return page.evaluate(contentForMarkdown).catch(() => page.content());
}

export async function markdown({
	context,
	options,
}: QuickActionContext<typeof commonOptionsSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	await afterNavigation(page, options);
	const html = await withStepTimeout(options, readForMarkdown(page), "Content");
	const meta = pageMeta(response, await page.title());
	return Response.json({
		success: true,
		result: toMarkdown(html, meta, options),
		meta,
	});
}
