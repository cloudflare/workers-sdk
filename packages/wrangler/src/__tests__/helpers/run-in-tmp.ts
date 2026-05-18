import { runInTempDir as runInTempDirCommon } from "@cloudflare/workers-utils/test-helpers";

export function runInTempDir(options?: { homedir: string }) {
	runInTempDirCommon(options);
	// Auth state is read on demand from the auth config file in the current
	// home directory, so no module-level cache to invalidate after the temp
	// directory has been swapped in.
}
