import { z } from "zod";
import { Response } from "../../../http";
import { toMarkdown } from "./markdown";
import { afterNavigation, openPage, pageMeta, withStepTimeout } from "./page";
import { addIssue, quickActionOptions } from "./schemas";
import type { QuickActionContext } from "./page";

export const jsonSchema = quickActionOptions(
	{
		prompt: z.string().optional(),
		response_format: z
			.object({
				type: z.string(),
				json_schema: z.record(z.string(), z.unknown()).nullable().optional(),
			})
			.superRefine((format, ctx) => {
				if (
					format.type === "json_schema" &&
					(format.json_schema == null ||
						Object.keys(format.json_schema).length === 0)
				) {
					addIssue(
						ctx,
						["json_schema"],
						"response_format.json_schema is required and must be non-empty when response_format.type is 'json_schema'"
					);
				}
			})
			.optional(),
		// Supported models and limits change over time, so they're not checked
		custom_ai: z
			.array(
				z.object({
					model: z.string(),
					authorization: z.string().optional(),
				})
			)
			.optional(),
	},
	(data, ctx) => {
		if (!data.prompt && !data.response_format) {
			addIssue(
				ctx,
				["prompt", "response_format"],
				"Either 'prompt' or 'response_format' must be defined"
			);
		}
	}
);

function placeholderFor(
	schema: unknown,
	root: unknown = schema,
	refs: ReadonlySet<string> = new Set()
): unknown {
	if (typeof schema !== "object" || schema === null) {
		return null;
	}
	const node = schema as Record<string, unknown>;
	if ("const" in node) {
		return node.const;
	}
	if (Array.isArray(node.enum) && node.enum.length > 0) {
		return node.enum[0];
	}
	if ("default" in node) {
		return node.default;
	}
	if (typeof node.$ref === "string") {
		return refs.has(node.$ref)
			? null
			: placeholderFor(
					resolveRef(root, node.$ref),
					root,
					new Set(refs).add(node.$ref)
				);
	}
	const types = Array.isArray(node.type) ? node.type : [node.type];
	const type = types.find((t) => t !== "null");
	switch (type ?? (node.properties ? "object" : undefined)) {
		case "string":
			return "";
		case "number":
		case "integer":
			return 0;
		case "boolean":
			return false;
		case "array":
			return [];
		case "object":
			return Object.fromEntries(
				Object.entries((node.properties ?? {}) as Record<string, unknown>).map(
					([key, property]) => [key, placeholderFor(property, root, refs)]
				)
			);
		default:
			return null;
	}
}

function resolveRef(root: unknown, ref: string): unknown {
	if (ref !== "#" && !ref.startsWith("#/")) {
		return undefined;
	}
	let node = root;
	for (const token of ref.split("/").slice(1)) {
		if (typeof node !== "object" || node === null) {
			return undefined;
		}
		node = (node as Record<string, unknown>)[
			token.replaceAll("~1", "/").replaceAll("~0", "~")
		];
	}
	return node;
}

export async function json({
	context,
	options,
	log,
}: QuickActionContext<typeof jsonSchema>): Promise<Response> {
	const { page, response } = await openPage(context, options);
	await afterNavigation(page, options);
	const html = await withStepTimeout(options, page.content(), "Content");
	const meta = pageMeta(response, await page.title());
	// Real extraction reads the Markdown, so its conversion errors surface
	toMarkdown(html, meta, options);
	log.warn(
		"Browser Run's `json` quick action extracts data with Workers AI, which isn't available locally. " +
			"The result is placeholder data shaped like `response_format.json_schema`. " +
			'Set `"remote": true` on the browser binding to extract real data.'
	);
	const schema = options.response_format?.json_schema;
	return Response.json({
		success: true,
		result: schema ? placeholderFor(schema) : {},
		meta,
	});
}
