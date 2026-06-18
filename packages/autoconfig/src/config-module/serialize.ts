/**
 * Serialize the plain config objects produced by {@link splitRawConfig} into
 * `cloudflare.config.ts` / `wrangler.config.ts` source text.
 *
 * The objects are emitted as TypeScript object literals wrapped in the
 * appropriate `defineWorker` / `defineWranglerConfig` call. Binding `env`
 * entries are printed as plain type-tagged literals (`{ type: "kv", id }`),
 * which are valid `@cloudflare/config` config — the `bindings.*` builders are
 * just sugar that produces the same shape.
 */
import type { NewConfigSplit } from "./split";

/**
 * The module specifier the generated files import their `define*` helpers
 * from. `wrangler/experimental-config` re-exports `defineWorker` (from
 * `@cloudflare/config`) and `defineWranglerConfig`, so a single dependency
 * (wrangler, which autoconfig already installs) covers both files.
 */
export const CONFIG_IMPORT_SOURCE = "wrangler/experimental-config";

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Print an object key, quoting it when it isn't a bare identifier. */
function printKey(key: string): string {
	return VALID_IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

/**
 * Print a JS value as TypeScript source. `indent` is the current indentation
 * (tabs). Objects and arrays are printed multi-line; empty ones inline.
 */
function printValue(value: unknown, indent: string): string {
	if (value === null) {
		return "null";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "[]";
		}
		const inner = indent + "\t";
		const items = value
			.map((item) => `${inner}${printValue(item, inner)},`)
			.join("\n");
		return `[\n${items}\n${indent}]`;
	}
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) {
			return "{}";
		}
		const inner = indent + "\t";
		const lines = entries
			.map(
				([key, val]) => `${inner}${printKey(key)}: ${printValue(val, inner)},`
			)
			.join("\n");
		return `{\n${lines}\n${indent}}`;
	}
	// undefined / functions / symbols shouldn't appear (splitRawConfig omits
	// undefined); fall back to `null` rather than emitting invalid source.
	return "null";
}

function emitModule(
	helper: string,
	config: Record<string, unknown>,
	importSource: string
): string {
	return (
		`import { ${helper} } from "${importSource}";\n\n` +
		`export default ${helper}(${printValue(config, "")});\n`
	);
}

/** Serialize the runtime config to `cloudflare.config.ts` source. */
export function serializeCloudflareConfig(
	worker: NewConfigSplit["worker"],
	importSource: string = CONFIG_IMPORT_SOURCE
): string {
	return emitModule("defineWorker", worker, importSource);
}

/** Serialize the tooling config to `wrangler.config.ts` source. */
export function serializeWranglerConfig(
	tooling: NewConfigSplit["tooling"],
	importSource: string = CONFIG_IMPORT_SOURCE
): string {
	return emitModule("defineWranglerConfig", tooling, importSource);
}
