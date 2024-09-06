import { z } from "zod";

export const RoutingConfigSchema = z.object({
	hasUserWorker: z.boolean().optional(),
});

export const AssetConfigSchema = z.object({
	htmlHandling: z
		.enum([
			"auto-trailing-slash",
			"force-trailing-slash",
			"drop-trailing-slash",
			"none",
		])
		.optional(),
	notFoundHandling: z
		.enum(["single-page-application", "404-page", "none"])
		.optional(),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

export type AssetConfig = z.infer<typeof AssetConfigSchema>;

export const HEADER_SIZE = 20;
export const PATH_HASH_SIZE = 16;
export const CONTENT_HASH_SIZE = 16;
export const TAIL_SIZE = 8;
export const PATH_HASH_OFFSET = 0;
export const CONTENT_HASH_OFFSET = PATH_HASH_SIZE;
export const ENTRY_SIZE = PATH_HASH_SIZE + CONTENT_HASH_SIZE + TAIL_SIZE;

export const MAX_ASSET_COUNT = 20_000;
export const MAX_ASSET_SIZE = 25 * 1024 * 1024;

// TODO: add some comments to explain this
export const encodeFilePath = (filePath: string, sep: string) => {
	const encodedPath = filePath
		.split(sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return "/" + encodedPath;
};

export const decodeFilePath = (filePath: string, sep: string) => {
	return filePath
		.split("/")
		.map((segment) => decodeURIComponent(segment))
		.join(sep);
};
