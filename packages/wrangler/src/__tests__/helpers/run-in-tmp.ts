import { runInTempDir as runInTempDirCommon } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach } from "vitest";
import { purgeConfigCaches } from "../../config-cache";
import { reinitialiseAuthTokens } from "../../user";

export function runInTempDir(options?: { homedir: string }) {
	runInTempDirCommon(options);
	beforeEach(() => {
		// Now that we have changed the home directory location, we must reinitialize the user auth state
		reinitialiseAuthTokens();
		// Also reset the config cache
		purgeConfigCaches();
	});
}
