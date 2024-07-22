import path from "node:path";
import { isRoutesJSONSpec } from "./pages/functions/routes-validation";
import type { Config } from "./config";

const errorIsModuleNotFound = (thrown: unknown): thrown is Error =>
	thrown instanceof Error &&
	"code" in thrown &&
	thrown.code === "MODULE_NOT_FOUND";

type AssetsRoute = {};

type AssetExternalConfigVersion2 = {
	version: 2;
	directory?: string;
	binding?: string;
	routes?: AssetsRoute[];
};

const isAssetExternalConfigVersion2 = (
	data: unknown
): data is AssetExternalConfigVersion2 => {
	return (
		(typeof data === "object" &&
			data &&
			"version" in data &&
			typeof (data as AssetExternalConfigVersion2).version === "number" &&
			(data as AssetExternalConfigVersion2).version === 2 &&
			("directory" in data
				? typeof (data as AssetExternalConfigVersion2).directory === "string"
				: true) &&
			("binding" in data
				? typeof (data as AssetExternalConfigVersion2).binding === "string"
				: true) &&
			("routes" in data
				? Array.isArray((data as AssetExternalConfigVersion2).routes)
				: true)) ||
		false
	);
};

const resolveExternalAssetsConfig = async (
	assetsConfigPath: string,
	wranglerConfigDirectory: string
) => {
	let resolvedAssetConfigPath: string;

	try {
		resolvedAssetConfigPath = require.resolve(assetsConfigPath, {
			paths: [wranglerConfigDirectory],
		});
	} catch (thrown) {
		if (errorIsModuleNotFound(thrown)) {
			return undefined;
		}
		throw thrown;
	}

	// TODO: Support TS?
	// TODO: Transform URLPattern objects within
	const assetConfig = require(resolvedAssetConfigPath);

	if (isRoutesJSONSpec(assetConfig)) {
		// TODO: Transform
		return {
			routes: [{}],
		};
	}

	if (!isAssetExternalConfigVersion2(assetConfig)) {
		// TODO: proper error
		throw new Error(
			`"${resolvedAssetConfigPath}" does not conform to the expected version 2 external assets config format.`
		);
	}

	return assetConfig;
};

export type AssetsConfig = {
	directory: string;
	binding?: string;
	routes?: AssetsRoute[];
};

const validateAssetsConfig = (
	config: Record<string, unknown>
): config is AssetsConfig => {
	if (!("directory" in config)) {
		throw new Error('Missing "directory" in assets config');
	}

	if (
		"binding" in config &&
		config.binding !== undefined &&
		typeof config.binding !== "string"
	) {
		throw new Error('Expected "binding" to be a string');
	}

	if (
		"routes" in config &&
		config.routes !== undefined &&
		!Array.isArray(config.routes)
	) {
		throw new Error('Expected "routes" to be an array');
	}

	return true;
};

export const getAssetsConfig = async (
	config: Config,
	assetDirectoryArg: string | undefined
) => {
	if (assetDirectoryArg) {
		return {
			directory: path.resolve(process.cwd(), assetDirectoryArg),
		};
	}

	if (!config.experimental_assets) {
		return;
	}

	const configDirectory = path.resolve(
		path.dirname(config.configPath ?? "wrangler.toml")
	);

	if (typeof config.experimental_assets === "string") {
		return {
			directory: path.resolve(configDirectory, config.experimental_assets),
		};
	}

	const externalConfig =
		config.experimental_assets &&
		"config" in config.experimental_assets &&
		config.experimental_assets.config !== undefined
			? await resolveExternalAssetsConfig(
					config.experimental_assets.config,
					configDirectory
				)
			: { directory: undefined };

	const mergedConfig: Partial<AssetsConfig> = {
		directory:
			externalConfig && "directory" in externalConfig
				? externalConfig.directory ?? config.experimental_assets?.directory
				: config.experimental_assets?.directory,
		binding:
			externalConfig && "binding" in externalConfig
				? externalConfig.binding ?? config.experimental_assets?.binding
				: config.experimental_assets?.binding,
		routes:
			externalConfig && "routes" in externalConfig
				? externalConfig.routes
				: undefined,
	};

	if (validateAssetsConfig(mergedConfig)) {
		return mergedConfig;
	}
};
