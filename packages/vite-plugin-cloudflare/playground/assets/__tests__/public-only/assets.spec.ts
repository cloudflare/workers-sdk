import { expect, test } from "vitest";
import { getResponse } from "../../../__test-utils__";

test("fetches public directory asset", async () => {
	const response = await getResponse("/public-image.svg");
	const contentType = await response.headerValue("content-type");
	expect(contentType).toBe("image/svg+xml");
});
