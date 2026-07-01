import type { ParsedWranglerConfig } from "./schema";
import type { RawConfig } from "@cloudflare/workers-utils";

/**
 * Convert the validated camelCase `wrangler.config.ts` shape into the
 * snake_case `Partial<RawConfig>` shape consumed by Wrangler's existing
 * `normalizeAndValidateConfig`.
 */
export function convertToolingConfig(
	parsed: ParsedWranglerConfig
): Partial<RawConfig> {
	const result: Partial<RawConfig> = {};

	if (parsed.noBundle !== undefined) {
		result.no_bundle = parsed.noBundle;
	}
	if (parsed.minify !== undefined) {
		result.minify = parsed.minify;
	}
	if (parsed.keepNames !== undefined) {
		result.keep_names = parsed.keepNames;
	}
	if (parsed.alias !== undefined) {
		result.alias = parsed.alias;
	}
	if (parsed.define !== undefined) {
		result.define = parsed.define;
	}
	if (parsed.findAdditionalModules !== undefined) {
		result.find_additional_modules = parsed.findAdditionalModules;
	}
	if (parsed.preserveFileNames !== undefined) {
		result.preserve_file_names = parsed.preserveFileNames;
	}
	if (parsed.baseDir !== undefined) {
		result.base_dir = parsed.baseDir;
	}
	if (parsed.rules !== undefined) {
		result.rules = parsed.rules;
	}
	if (parsed.wasmModules !== undefined) {
		result.wasm_modules = parsed.wasmModules;
	}
	if (parsed.textBlobs !== undefined) {
		result.text_blobs = parsed.textBlobs;
	}
	if (parsed.dataBlobs !== undefined) {
		result.data_blobs = parsed.dataBlobs;
	}
	if (parsed.tsconfig !== undefined) {
		result.tsconfig = parsed.tsconfig;
	}
	if (parsed.jsxFactory !== undefined) {
		result.jsx_factory = parsed.jsxFactory;
	}
	if (parsed.jsxFragment !== undefined) {
		result.jsx_fragment = parsed.jsxFragment;
	}
	if (parsed.pythonModules !== undefined) {
		// `convertToolingConfig` is a thin name/shape translator — it does not
		// apply defaults. `pythonModules: {}` (no `exclude`) is passed through
		// as `python_modules: {}`, even though `RawConfig.python_modules.exclude`
		// is typed as required; downstream `normalizeAndValidateConfig` is
		// responsible for resolving / defaulting / validating the shape.
		result.python_modules = (
			parsed.pythonModules.exclude !== undefined
				? { exclude: parsed.pythonModules.exclude }
				: {}
		) as RawConfig["python_modules"];
	}
	if (parsed.uploadSourceMaps !== undefined) {
		result.upload_source_maps = parsed.uploadSourceMaps;
	}
	if (parsed.build !== undefined) {
		result.build = {
			command: parsed.build.command,
			cwd: parsed.build.cwd,
			watch_dir: parsed.build.watchDir,
		};
	}
	if (parsed.dev !== undefined) {
		result.dev = {
			ip: parsed.dev.ip,
			port: parsed.dev.port,
			inspector_port: parsed.dev.inspectorPort,
			inspector_ip: parsed.dev.inspectorIp,
			local_protocol: parsed.dev.localProtocol,
			upstream_protocol: parsed.dev.upstreamProtocol,
			host: parsed.dev.host,
			// `dev.types` is intentionally NOT mapped — it is consumed
			// separately via the `types` field on `LoadNewConfigResult`, not
			// threaded through `RawConfig`. The legacy `config.dev.generate_types`
			// gate is not used when `--experimental-new-config` is on.
			enable_containers: parsed.dev.enableContainers,
			container_engine: parsed.dev.containerEngine,
		};
	}
	if (parsed.sendMetrics !== undefined) {
		result.send_metrics = parsed.sendMetrics;
	}
	if (parsed.assetsDirectory !== undefined) {
		result.assets = { directory: parsed.assetsDirectory };
	}

	return result;
}
