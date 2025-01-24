import { z } from "zod";

export const RoutingConfigSchema = z.object({
	has_user_worker: z.boolean().optional(),
	invoke_user_worker_ahead_of_assets: z.boolean().optional(),

	// Used for analytics and reporting
	account_id: z.number().optional(),
	script_id: z.number().optional(),
});

export const AssetConfigSchema = z.object({
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
	serve_directly: z.boolean().optional(),
	run_worker_first: z.boolean().optional(),
});

export const InternalConfigSchema = z.object({
	// Used for analytics and reporting
	account_id: z.number().optional(),
	script_id: z.number().optional(),
});

export const AssetWorkerConfigShema = z.object({
	...AssetConfigSchema.shape,
	...InternalConfigSchema.shape,
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type AssetConfig = z.infer<typeof AssetConfigSchema>;
export type AssetWorkerConfig = z.infer<typeof AssetWorkerConfigShema>;

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
