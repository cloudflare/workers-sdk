import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

// todo(justinvdm, 2025-02-04): Since this example uses Workers AI, there is CLI interactivity required to choose and authenticate for the account
// that should be used when talking to the Workers AI API, making it difficult to run this test automatically. Once the plugin accepts an account id
// this test might be able to be unskipped.
test.skip("basic hello-world functionality", async () => {
	expect(JSON.parse(await getTextResponse())).toContain("PONG");
});
