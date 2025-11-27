import * as fs from "node:fs";
import {
	getEnvironmentVariableFactory,
	UserError,
} from "@cloudflare/workers-utils";
import { logger } from "./logger";

const getHttpsKeyPathFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_HTTPS_KEY_PATH",
});
const getHttpsCertPathFromEnv = getEnvironmentVariableFactory({
	variableName: "WRANGLER_HTTPS_CERT_PATH",
});
/**
 * Validate custom options (i.e. SSL certificates) for running an HTTPS server.
 *
 * If no certificates are provided, this will return `undefined`, and the caller should
 * use a default set of certificates (in the Wrangler case, this means that Miniflare will handle it)
 * See packages/miniflare/src/http/cert.ts
 */
export function validateHttpsOptions(
	customHttpsKeyPath = getHttpsKeyPathFromEnv(),
	customHttpsCertPath = getHttpsCertPathFromEnv()
) {
	if (customHttpsKeyPath !== undefined || customHttpsCertPath !== undefined) {
		if (customHttpsKeyPath === undefined || customHttpsCertPath === undefined) {
			throw new UserError(
				"Must specify both certificate path and key path to use a Custom Certificate."
			);
		}
		if (!fs.existsSync(customHttpsKeyPath)) {
			throw new UserError(
				"Missing Custom Certificate Key at " + customHttpsKeyPath
			);
		}
		if (!fs.existsSync(customHttpsCertPath)) {
			throw new UserError(
				"Missing Custom Certificate File at " + customHttpsCertPath
			);
		}

		logger.log("Using custom certificate at ", customHttpsKeyPath);

		return {
			key: fs.readFileSync(customHttpsKeyPath, "utf8"),
			cert: fs.readFileSync(customHttpsCertPath, "utf8"),
		};
	}
}
