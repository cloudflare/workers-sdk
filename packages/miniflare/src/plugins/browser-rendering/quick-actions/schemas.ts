import { z } from "zod";

const lifecycleEvent = z.union([
	z.literal("load"),
	z.literal("domcontentloaded"),
	z.literal("networkidle0"),
	z.literal("networkidle2"),
]);

const resourceType = z.union(
	(
		[
			"document",
			"stylesheet",
			"image",
			"media",
			"font",
			"script",
			"texttrack",
			"xhr",
			"fetch",
			"prefetch",
			"eventsource",
			"websocket",
			"manifest",
			"signedexchange",
			"ping",
			"cspviolationreport",
			"preflight",
			"other",
		] as const
	).map((type) => z.literal(type))
);

const commonShape = {
	addScriptTag: z
		.array(
			z.object({
				content: z.string().optional(),
				url: z.url().optional(),
				type: z.string().optional(),
				id: z.string().optional(),
			})
		)
		.optional(),
	addStyleTag: z
		.array(
			z
				.object({ content: z.string().optional(), url: z.url().optional() })
				.refine((tag) => tag.content !== undefined || tag.url !== undefined, {
					message:
						"Each style tag must have either 'content' or 'url' defined.",
				})
		)
		.optional(),
	authenticate: z
		.object({ username: z.string().min(1), password: z.string().min(1) })
		.optional(),
	cookies: z
		.array(
			z.object({
				name: z.string(),
				value: z.string(),
				url: z.string().optional(),
				domain: z.string().optional(),
				path: z.string().optional(),
				secure: z.boolean().optional(),
				httpOnly: z.boolean().optional(),
				sameSite: z
					.union([z.literal("Strict"), z.literal("Lax"), z.literal("None")])
					.optional(),
				expires: z.number().optional(),
				priority: z
					.union([z.literal("Low"), z.literal("Medium"), z.literal("High")])
					.optional(),
				sameParty: z.boolean().optional(),
				sourceScheme: z
					.union([
						z.literal("Unset"),
						z.literal("NonSecure"),
						z.literal("Secure"),
					])
					.optional(),
				sourcePort: z.number().optional(),
				partitionKey: z.string().optional(),
			})
		)
		.optional(),
	emulateMediaType: z.string().optional(),
	gotoOptions: z
		.object({
			timeout: z.number().optional(),
			waitUntil: z
				.union([lifecycleEvent, z.array(lifecycleEvent)])
				.default("domcontentloaded"),
			referer: z.string().optional(),
			referrerPolicy: z.string().optional(),
		})
		.prefault({}),
	rejectRequestPattern: z.array(z.string()).optional(),
	allowRequestPattern: z.array(z.string()).optional(),
	rejectResourceTypes: z.array(resourceType).optional(),
	allowResourceTypes: z.array(resourceType).optional(),
	setExtraHTTPHeaders: z.record(z.string(), z.string()).optional(),
	setJavaScriptEnabled: z.boolean().optional(),
	userAgent: z
		.string()
		.default(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
		),
	viewport: z
		.object({
			width: z.number(),
			height: z.number(),
			deviceScaleFactor: z.number().optional(),
			isMobile: z.boolean().optional(),
			isLandscape: z.boolean().optional(),
			hasTouch: z.boolean().optional(),
		})
		.optional()
		.default({ width: 1920, height: 1080 }),
	waitForSelector: z
		.object({
			hidden: z.literal(true).optional(),
			selector: z.string(),
			timeout: z.number().optional(),
			visible: z.literal(true).optional(),
		})
		.optional(),
	waitForTimeout: z.number().optional(),
	bestAttempt: z.boolean().optional(),
	actionTimeout: z.number().optional(),
	url: z
		.url()
		.refine((url) => !/^(chrome|javascript|file):/i.test(url), {
			message: "chrome://, javascript:, and file:// URLs are not allowed",
		})
		.optional(),
	html: z
		.string({ error: "Either 'url' or 'html' is required, but not both." })
		.min(1)
		.optional(),
};

type Refinement = (data: Record<string, unknown>, ctx: z.RefinementCtx) => void;

export function addIssue(
	ctx: z.RefinementCtx,
	path: string[],
	message: string
) {
	ctx.addIssue({ code: "custom", message, path });
}

export function quickActionOptions<Shape extends z.ZodRawShape>(
	actionShape: Shape,
	refine?: Refinement
) {
	return z
		.object({ ...commonShape, ...actionShape })
		.superRefine((data: Record<string, unknown>, ctx) => {
			if (data.rejectRequestPattern && data.allowRequestPattern) {
				addIssue(
					ctx,
					["rejectRequestPattern"],
					"rejectRequestPattern and allowRequestPattern cannot be set at the same time, please remove one of them"
				);
			}
			if (data.rejectResourceTypes && data.allowResourceTypes) {
				addIssue(
					ctx,
					["rejectResourceTypes"],
					"rejectResourceTypes and allowResourceTypes cannot be set at the same time, please remove one of them"
				);
			}
			if (data.url !== undefined && data.html !== undefined) {
				addIssue(
					ctx,
					["url"],
					"url and html cannot be set at the same time, please remove one of them"
				);
			} else if (data.url === undefined && data.html === undefined) {
				addIssue(ctx, ["url"], "Either 'url' or 'html' is required.");
			}
			refine?.(data, ctx);
		});
}

export const commonOptionsSchema = quickActionOptions({});

export type CommonOptions = z.output<typeof commonOptionsSchema>;

export const browserSchema = z.literal("kitesurf").optional();
