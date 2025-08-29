import { z } from "zod";

const InternalConfigSchema = z.object({
	account_id: z.number().optional(),
	script_id: z.number().optional(),
	debug: z.boolean().optional(),
});

const StaticRoutingSchema = z.object({
	user_worker: z.array(z.string()),
	asset_worker: z.array(z.string()).optional(),
});

export type StaticRouting = Required<
	Pick<z.infer<typeof StaticRoutingSchema>, "user_worker">
> &
	Omit<z.infer<typeof StaticRoutingSchema>, "user_worker">;

export const RouterConfigSchema = z.object({
	invoke_user_worker_ahead_of_assets: z.boolean().optional(),
	static_routing: StaticRoutingSchema.optional(),
	has_user_worker: z.boolean().optional(),
	...InternalConfigSchema.shape,
});

export const EyeballRouterConfigSchema = z.union([
	z.object({
		limitedAssetsOnly: z.boolean().optional(),
	}),
	z.null(),
]);

const MetadataStaticRedirectEntry = z.object({
	status: z.number(),
	to: z.string(),
	lineNumber: z.number(),
});

const MetadataRedirectEntry = z.object({
	status: z.number(),
	to: z.string(),
});

const MetadataStaticRedirects = z.record(MetadataStaticRedirectEntry);
export type MetadataStaticRedirects = z.infer<typeof MetadataStaticRedirects>;
const MetadataRedirects = z.record(MetadataRedirectEntry);
export type MetadataRedirects = z.infer<typeof MetadataRedirects>;

const MetadataHeaderEntry = z.object({
	set: z.record(z.string()).optional(),
	unset: z.array(z.string()).optional(),
});

const MetadataHeaders = z.record(MetadataHeaderEntry);
export type MetadataHeaders = z.infer<typeof MetadataHeaders>;

export const RedirectsSchema = z
	.object({
		version: z.literal(1),
		staticRules: MetadataStaticRedirects,
		rules: MetadataRedirects,
	})
	.optional();

export const HeadersSchema = z
	.object({
		version: z.literal(2),
		rules: MetadataHeaders,
	})
	.optional();

export const AssetConfigSchema = z.object({
	compatibility_date: z.string().optional(),
	compatibility_flags: z.array(z.string()).optional(),
	html_handling: z
		.enum([
			"auto-trailing-slash",
			"force-trailing-slash",
			"drop-trailing-slash",
			"none",
		])
		.optional(),
	not_found_handling: z
		.enum(["single-page-application", "404-page", "none"])
		.optional(),
	redirects: RedirectsSchema,
	headers: HeadersSchema,
	has_static_routing: z.boolean().optional(),
	...InternalConfigSchema.shape,
});

export type EyeballRouterConfig = z.infer<typeof EyeballRouterConfigSchema>;
export type RouterConfig = z.infer<typeof RouterConfigSchema>;
export type AssetConfig = z.infer<typeof AssetConfigSchema>;

export interface UnsafePerformanceTimer {
	readonly timeOrigin: number;
	now: () => number;
}

export interface JaegerTracing {
	enterSpan<T extends unknown[], R = void>(
		name: string,
		span: (s: Span, ...args: T) => R,
		...args: T
	): R;
	getSpanContext(): SpanContext | null;
	runWithSpanContext<T extends unknown[]>(
		spanContext: SpanContext | null,
		callback: (...args: T) => unknown,
		...args: T
	): unknown;

	readonly traceId: string | null;
	readonly spanId: string | null;
	readonly parentSpanId: string | null;
	readonly cfTraceIdHeader: string | null;
}

export interface Span {
	addLogs(logs: JaegerRecord): void;
	setTags(tags: JaegerRecord): void;
	end(): void;

	isRecording: boolean;
}

export interface SpanContext {
	traceId: string;
	spanId: string;
	parentSpanId: string;
	traceFlags: number;
}

export type JaegerValue = string | number | boolean;
export type JaegerRecord = Record<string, JaegerValue>;

export interface ColoMetadata {
	metalId: number;
	coloId: number;
	coloRegion: string;
	coloTier: number;
}
