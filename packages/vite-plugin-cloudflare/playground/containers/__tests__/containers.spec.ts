import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

// skip until containers support is implemented in `vite preview`
test.skip("starts container", async () => {
	let response = await getTextResponse("/start");
	expect(response).toBe("Container create request sent...");

	response = await getTextResponse("/status");
	expect(response).toBe("true");
});
