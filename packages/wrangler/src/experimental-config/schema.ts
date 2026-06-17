import * as z from "zod";
import type { WranglerConfig } from "./types";

const RuleSchema = z.strictObject({
	type: z.enum([
		"ESModule",
		"CommonJS",
		"CompiledWasm",
		"Text",
		"Data",
		"PythonModule",
		"PythonRequirement",
	]),
	globs: z.array(z.string()),
	fallthrough: z.boolean().optional(),
});

const BuildSchema = z.strictObject({
	command: z.string().optional(),
	cwd: z.string().optional(),
	watchDir: z.union([z.string(), z.array(z.string())]).optional(),
});

const PythonModulesSchema = z.strictObject({
	exclude: z.array(z.string()).optional(),
});

const DevSchema = z.strictObject({
	ip: z.string().optional(),
	port: z.number().optional(),
	inspectorPort: z.number().optional(),
	inspectorIp: z.string().optional(),
	localProtocol: z.enum(["http", "https"]).optional(),
	upstreamProtocol: z.enum(["http", "https"]).optional(),
	host: z.string().optional(),
	types: z
		.strictObject({
			generate: z.boolean().optional(),
		})
		.optional(),
	enableContainers: z.boolean().optional(),
	containerEngine: z.string().optional(),
});

/**
 * Strict schema for `wrangler.config.ts`. Unknown keys produce a Zod
 * "unrecognized key" error — `loadNewConfig` augments these with a hint when
 * the key looks like a Worker-runtime field that should be in `cloudflare.config.ts`.
 */
export const WranglerConfigSchema = z.strictObject({
	noBundle: z.boolean().optional(),
	minify: z.boolean().optional(),
	keepNames: z.boolean().optional(),
	alias: z.record(z.string(), z.string()).optional(),
	define: z.record(z.string(), z.string()).optional(),
	findAdditionalModules: z.boolean().optional(),
	preserveFileNames: z.boolean().optional(),
	baseDir: z.string().optional(),
	rules: z.array(RuleSchema).optional(),
	wasmModules: z.record(z.string(), z.string()).optional(),
	textBlobs: z.record(z.string(), z.string()).optional(),
	dataBlobs: z.record(z.string(), z.string()).optional(),
	tsconfig: z.string().optional(),
	jsxFactory: z.string().optional(),
	jsxFragment: z.string().optional(),
	pythonModules: PythonModulesSchema.optional(),
	uploadSourceMaps: z.boolean().optional(),
	build: BuildSchema.optional(),
	assetsDirectory: z.string().optional(),
	dev: DevSchema.optional(),
	sendMetrics: z.boolean().optional(),
});

export type ParsedWranglerConfig = z.output<typeof WranglerConfigSchema>;

/**
 * The list of supported top-level keys in `wrangler.config.ts`. Used to
 * generate helpful error messages.
 */
export const WRANGLER_CONFIG_SUPPORTED_KEYS = Object.keys(
	WranglerConfigSchema.shape
);

/**
 * Worker-runtime field names that, if found at the top level of
 * `wrangler.config.ts`, should produce a hint to move them to
 * `cloudflare.config.ts`. Used by the error wrapper in `loadNewConfig`.
 */
export const WORKER_CONFIG_FIELD_HINTS = new Set<string>([
	"name",
	"accountId",
	"compatibilityDate",
	"compatibilityFlags",
	"entrypoint",
	"assets",
	"domains",
	"triggers",
	"tailConsumers",
	"cache",
	"placement",
	"limits",
	"logpush",
	"observability",
	"workersDev",
	"previewUrls",
	"complianceRegion",
	"firstPartyWorker",
	"unsafe",
	"env",
	"exports",
]);

/**
 * Bidirectional drift check between {@link WranglerConfigSchema} and the
 * public {@link WranglerConfig} interface.
 */
type _AssertWranglerSchemaMatchesType = [
	z.input<typeof WranglerConfigSchema> extends WranglerConfig ? true : false,
	WranglerConfig extends z.input<typeof WranglerConfigSchema> ? true : false,
];
const _assertWranglerSchemaMatchesType: _AssertWranglerSchemaMatchesType = [
	true,
	true,
];
void _assertWranglerSchemaMatchesType;
