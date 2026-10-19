import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { generateTypes, loadAndParseConfig } from "@cloudflare/config";
import {
	generateRuntimeTypes,
	RUNTIME_TYPES_MARKER,
} from "@cloudflare/runtime-types";
import { formatZodError } from "@cloudflare/workers-utils";
import type {
	ParsedInputConfig,
	ParsedInputWorkerConfig,
} from "@cloudflare/config";

type ParsedInputConfigWithWorker = Omit<ParsedInputConfig, "worker"> & {
	worker: ParsedInputWorkerConfig;
};

export const CLOUDFLARE_CONFIG_FILENAME = "cloudflare.config.ts";
const WRANGLER_CONFIG_FILENAMES = [
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
];
const TYPES_OUTPUT_PATH = ".cloudflare/types/index.d.ts";
const CONFIG_PACKAGE = "cf/config";

/**
 * Load and validate `cloudflare.config.ts` via `@cloudflare/config`, if it
 * exists. Returns the parsed default export, the absolute path of the loaded file, and
 * the files imported while resolving the config (for watch-mode).
 *
 * When `types.generate` is true, also writes `.cloudflare/types/index.d.ts`
 * when the generated content differs from what's already on disk.
 */
export async function loadCloudflareConfig(options: {
	root: string;
	mode: string;
	isPreview: boolean;
	types: { generate: boolean; includeRuntime: boolean };
}): Promise<
	| {
			parsedConfig: ParsedInputConfigWithWorker;
			configPath: string;
			dependencies: Set<string>;
	  }
	| undefined
> {
	const configPath = path.resolve(options.root, CLOUDFLARE_CONFIG_FILENAME);

	if (!fs.existsSync(configPath)) {
		const wranglerConfigFilename = WRANGLER_CONFIG_FILENAMES.find((filename) =>
			fs.existsSync(path.resolve(options.root, filename))
		);
		if (wranglerConfigFilename !== undefined) {
			throw new Error(
				`Found \`${wranglerConfigFilename}\` but no \`${CLOUDFLARE_CONFIG_FILENAME}\`. The Cloudflare Vite plugin no longer reads Wrangler configuration files, so this configuration would be ignored. Run \`npx cf migrate --bundler vite\` to generate \`${CLOUDFLARE_CONFIG_FILENAME}\`.`
			);
		}
		return;
	}

	const { result, dependencies } = await loadAndParseConfig(configPath, {
		isPreview: options.isPreview,
		mode: options.mode,
	});

	if (!result.success) {
		throw new Error(
			`Invalid \`${CLOUDFLARE_CONFIG_FILENAME}\`:\n${formatZodError(result.error)}`
		);
	}

	const worker = result.data.worker;
	if (worker === undefined) {
		throw new Error(
			`\`${CLOUDFLARE_CONFIG_FILENAME}\` must define a Worker using the \`worker\` property.`
		);
	}

	if (options.types.generate) {
		await writeCloudflareTypes({
			root: options.root,
			configPath,
			includeRuntime: options.types.includeRuntime,
			compatibilityDate: worker.compatibilityDate,
			compatibilityFlags: worker.compatibilityFlags ?? [],
		});
	}

	return {
		parsedConfig: { ...result.data, worker },
		configPath,
		dependencies,
	};
}

/**
 * Write `.cloudflare/types/index.d.ts` using
 * `@cloudflare/config`'s `generateTypes`, targeting the public `cf/config`
 * package used by `cloudflare.config.ts`.
 *
 * When `includeRuntime` is true, appends the Workers runtime types (generated
 * from the project's compatibility date/flags) after the inference block. The
 * runtime-types generator caches against the existing file content, so it only
 * spawns workerd when the compat date/flags/workerd version change.
 *
 * The existing file is read once and reused for both the runtime-types cache
 * check and the diff-before-write (only writes if content differs, to avoid
 * touching mtimes unnecessarily).
 */
async function writeCloudflareTypes(options: {
	root: string;
	configPath: string;
	includeRuntime: boolean;
	compatibilityDate: string;
	compatibilityFlags: string[];
}): Promise<void> {
	const outputPath = path.resolve(options.root, TYPES_OUTPUT_PATH);
	const outputDir = path.dirname(outputPath);
	const relativeConfigPath = path
		.relative(outputDir, options.configPath)
		.replaceAll("\\", "/");
	const configImportPath = relativeConfigPath.startsWith(".")
		? relativeConfigPath
		: `./${relativeConfigPath}`;

	let existingContent: string | undefined;
	try {
		existingContent = await fsp.readFile(outputPath, "utf8");
	} catch {
		// File doesn't exist yet — we'll create it below.
	}

	let content = generateTypes({
		configPath: configImportPath,
		packageName: CONFIG_PACKAGE,
	});

	if (options.includeRuntime) {
		const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
			compatibilityDate: options.compatibilityDate,
			compatibilityFlags: options.compatibilityFlags,
			existingContent,
		});
		content += `\n${runtimeHeader}\n${RUNTIME_TYPES_MARKER}\n${runtimeTypes}`;
	}

	if (existingContent !== content) {
		await fsp.mkdir(outputDir, { recursive: true });
		await fsp.writeFile(outputPath, content);
	}
}
