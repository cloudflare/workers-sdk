import { writeFile } from "fs/promises";
import path from "path";
import { readConfig } from "../../config";
import type { Config } from "../../config";

export async function generateProjectTypes(options: {
	config?: Config;
	configFile?: string;
	outFile?: string;
	persistToFilesystem?: boolean;
}): Promise<string> {
	return generateTypes(getProjectTypes, options);
}

export async function generateRuntimeTypes(options: {
	config?: Config;
	configFile?: string;
	outFile?: string;
	persistToFilesystem?: boolean;
}): Promise<string> {
	return generateTypes(
		async (config) =>
			getRuntimeTypes({
				compatibilityDate: config.compatibility_date,
				compatibilityFlags: config.compatibility_flags.filter(
					(flag) => !flag.includes("nodejs_compat")
				),
			}),
		options
	);
}

async function generateTypes(
	getTypesFunction: (config: Config) => Promise<string>,
	{
		config,
		configFile,
		outFile,
		persistToFilesystem = false,
	}: {
		config?: Config;
		configFile?: string;
		outFile?: string;
		persistToFilesystem?: boolean;
	}
): Promise<string> {
	if (!config && !configFile) {
		throw new Error("Either config or configFile must be provided");
	}
	if (config && configFile) {
		throw new Error("Only one of config or configFile should be provided");
	}
	if (outFile && persistToFilesystem === undefined) {
		throw new Error(
			"persistToFilesystem must be specified when outFile is provided"
		);
	}

	const resolvedConfig = config ?? readConfig(configFile, {});

	const types = await getTypesFunction(resolvedConfig);

	if (persistToFilesystem) {
		const resolvedOutFile =
			outFile ?? path.join(process.cwd(), "runtime-configuration.d.ts");

		await writeFile(resolvedOutFile, types, "utf8");
	}

	return types;
}
