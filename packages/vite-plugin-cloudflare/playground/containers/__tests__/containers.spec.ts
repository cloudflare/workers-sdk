import { expect, test } from "vitest";
import { getTextResponse, isBuild } from "../../__test-utils__";

// skip build test until containers support is implemented in `vite preview`
test.skipIf(isBuild)("starts container", async () => {
	const startResponse = await getTextResponse("/start");
	expect(startResponse).toBe("Container create request sent...");

	const statusResponse = await getTextResponse("/status");
	expect(statusResponse).toBe("true");
});
