import { test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

test("constructs an AWS SDK v3 client", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"(AWS SDK) client is instance of DynamoDBClient": true,
	});
});
