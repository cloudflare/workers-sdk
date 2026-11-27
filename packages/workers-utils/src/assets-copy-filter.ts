import {
	createAssetsCopyFilter as createFilter,
	InvalidAssetsIgnoreError,
} from "@cloudflare/workers-shared/utils/helpers";
import { UserError } from "./errors";

/** Create a copy filter that honors `.assetsignore` and preserves root asset metadata. */
export async function createAssetsCopyFilter(
	directory: string
): Promise<(relativePath: string) => Promise<boolean>> {
	try {
		return await createFilter(directory);
	} catch (error) {
		if (error instanceof InvalidAssetsIgnoreError) {
			throw new UserError(error.message, {
				telemetryMessage: "assets ignore invalid encoding",
			});
		}
		throw error;
	}
}
