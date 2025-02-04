import { expect, test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

test.runIf(isBuild)("runs D1 query using Prisma", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual([
		{ id: 1, email: "jane@prisma.io", name: "Jane Doe (Local)" },
	]);
});
