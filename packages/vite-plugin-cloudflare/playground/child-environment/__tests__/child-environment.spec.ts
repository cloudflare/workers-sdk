import { expect, test } from "vitest";
import { getTextResponse, isBuild } from "../../__test-utils__";

test.runIf(!isBuild)("can import module from child environment", async () => {
	const response = await getTextResponse();
	expect(response).toBe("Hello from the child environment");
});
