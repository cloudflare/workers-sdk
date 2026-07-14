/**
 * Vendored copies of the asset/router Worker config types that are owned by
 * `@cloudflare/workers-shared` (`utils/types.ts`, derived from Zod schemas).
 *
 * These are duplicated here deliberately. `@cloudflare/workers-shared` ships no
 * build output and is consumed as raw source, which `tsdown`'s declaration
 * bundler cannot compile from a consumer's context (it emits nothing for
 * workers-shared source files, producing `MISSING_EXPORT` errors). Importing
 * these two config types from source therefore breaks the `.d.ts` build of both
 * this package and Wrangler (which bundles this package's source).
 *
 * Vendoring keeps these types out of the workers-shared source graph entirely,
 * so both packages build with a plain declaration step. Drift from the
 * source-of-truth is guarded at type-check time by `workers-shared-config.compat.ts`.
 */

export interface StaticRouting {
	user_worker: string[];
	asset_worker?: string[];
}

export interface RouterConfig {
	invoke_user_worker_ahead_of_assets?: boolean;
	static_routing?: StaticRouting;
	has_user_worker?: boolean;
	// InternalConfigSchema
	account_id?: number;
	script_id?: number;
	debug?: boolean;
}

interface MetadataStaticRedirectEntry {
	status: number;
	to: string;
	lineNumber: number;
}

interface MetadataRedirectEntry {
	status: number;
	to: string;
}

interface MetadataHeaderEntry {
	set?: Record<string, string>;
	unset?: string[];
}

export interface AssetConfig {
	compatibility_date?: string;
	compatibility_flags?: string[];
	html_handling?:
		| "auto-trailing-slash"
		| "force-trailing-slash"
		| "drop-trailing-slash"
		| "none";
	not_found_handling?: "single-page-application" | "404-page" | "none";
	redirects?: {
		version: 1;
		staticRules: Record<string, MetadataStaticRedirectEntry>;
		rules: Record<string, MetadataRedirectEntry>;
	};
	headers?: {
		version: 2;
		rules: Record<string, MetadataHeaderEntry>;
	};
	has_static_routing?: boolean;
	// InternalConfigSchema
	account_id?: number;
	script_id?: number;
	debug?: boolean;
}
