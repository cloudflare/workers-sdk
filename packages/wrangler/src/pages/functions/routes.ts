// Re-export from @cloudflare/pages-functions — this file is kept for
// backward compatibility with existing Wrangler-internal imports and to keep
// the initial migration minimal without changing lots and lots of files
// TODO(dario): after the initial pages-functions migration remove these re-exports
//
// writeRoutesModule is wrapped to convert PagesFunctionsError into
// the Wrangler UserError subclass with the original telemetry labels.
import {
	writeRoutesModule as packageWriteRoutesModule,
	PagesFunctionsError,
	PagesFunctionsErrorCode,
} from "@cloudflare/pages-functions";
import { UserError } from "@cloudflare/workers-utils";

export { generateRoutesModuleSource } from "@cloudflare/pages-functions";
export type {
	HTTPMethod,
	Config,
	RouteConfig,
} from "@cloudflare/pages-functions";

/**
 * Map the package's error codes for module-path / module-identifier
 * validation to the original Wrangler telemetry labels.
 */
const ROUTES_MODULE_TELEMETRY: Partial<
	Record<PagesFunctionsErrorCode, string>
> = {
	[PagesFunctionsErrorCode.INVALID_MODULE_PATH]:
		"pages functions invalid module path",
	[PagesFunctionsErrorCode.INVALID_MODULE_IDENTIFIER]:
		"pages functions invalid module identifier",
};

/**
 * Write a JavaScript routes module, wrapping package errors into
 * Wrangler `UserError` instances with the original telemetry labels.
 *
 * @param args - Route configuration, source directory, and output path
 * @returns The path the module was written to
 * @throws UserError when the module path or identifier is invalid
 */
export async function writeRoutesModule(
	...args: Parameters<typeof packageWriteRoutesModule>
) {
	try {
		return await packageWriteRoutesModule(...args);
	} catch (e) {
		if (e instanceof UserError) {
			throw e;
		}
		if (e instanceof PagesFunctionsError) {
			const telemetry = ROUTES_MODULE_TELEMETRY[e.code];
			if (telemetry) {
				throw new UserError(e.message, { telemetryMessage: telemetry });
			}
		}
		throw e;
	}
}
