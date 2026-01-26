import { runInTempDir as runInTempDirCommon } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach } from "vitest";
import { disableConfigCache } from "../../config-cache";
import { reinitialiseAuthTokens } from "../../user";

export function runInTempDir({
	homedir,
	disableCaching = true,
}: {
	homedir?: string;
	disableCaching?: boolean;
} = {}) {
	runInTempDirCommon(homedir ? { homedir } : undefined);
	beforeEach(() => {
		// Now that we have changed the home directory location, we must reinitialize the user auth state
		reinitialiseAuthTokens();
		if (disableCaching) {
			disableConfigCache();
		}
	});
}
