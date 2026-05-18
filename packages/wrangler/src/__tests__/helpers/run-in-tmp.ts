import { runInTempDir as runInTempDirCommon } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach } from "vitest";

export function runInTempDir(options?: { homedir: string }) {
	runInTempDirCommon(options);
	beforeEach(() => {});
}
