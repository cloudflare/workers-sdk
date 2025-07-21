import { expect, test } from "vitest";
import { getTextResponse, isBuild, isCINonLinux } from "../../__test-utils__";

// skip build test until containers support is implemented in `vite preview`
// We can only really run these tests on Linux, because we build our images for linux/amd64,
// and github runners don't really support container virtualization in any sane way
test.skipIf(isBuild || isCINonLinux)("starts container", async () => {
	const startResponse = await getTextResponse("/start");
	expect(startResponse).toBe("Container create request sent...");

	const statusResponse = await getTextResponse("/status");
	expect(statusResponse).toBe("true");
});
