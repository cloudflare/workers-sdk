import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("basic hello-world functionality", async () => {
	expect(JSON.parse(await getTextResponse())).toContain("PONG");
});
