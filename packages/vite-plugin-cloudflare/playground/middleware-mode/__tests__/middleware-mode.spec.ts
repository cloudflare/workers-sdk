import { expect, test } from "vitest";

import { getTextResponse, isBuild } from "../../__test-utils__";

test.skipIf(isBuild)("returns correct response", async () => {
	const response = await getTextResponse();
	expect(response).toEqual("Cloudflare-Workers");
});
