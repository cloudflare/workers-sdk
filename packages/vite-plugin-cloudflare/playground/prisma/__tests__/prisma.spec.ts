import { expect, test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

// Need to remove the `.wrangler` directory and run the following commands before the test.
// Not sure how to with our testing setup.
// const commands = [
// 	`pnpm wrangler d1 migrations apply prisma-demo-db --local`,
// 	`pnpm wrangler d1 execute prisma-demo-db --command "INSERT INTO  \"User\" (\"email\", \"name\") VALUES ('jane@prisma.io', 'Jane Doe (Local)');" --local`,
// ];

test.skip("runs D1 query using Prisma", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual([
		{ id: 1, email: "jane@prisma.io", name: "Jane Doe (Local)" },
	]);
});
