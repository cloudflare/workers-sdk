import { runInTempDir as runInTempDirCommon } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach } from "vitest";
import { clearProfileOverride, reinitialiseAuthTokens } from "../../user";

export function runInTempDir(options?: { homedir: string }) {
	runInTempDirCommon(options);
	beforeEach(() => {
		// Reset the profile override so tests don't leak state
		clearProfileOverride();
		// Now that we have changed the home directory location, we must reinitialize the user auth state
		reinitialiseAuthTokens();
	});
}
