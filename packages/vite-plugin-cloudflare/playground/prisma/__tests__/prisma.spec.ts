import { expect, test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

// Need to remove the `.wrangler` directory and run the following commands before the tests:
//
// 	`pnpm wrangler d1 migrations apply prisma-demo-db --local`,
// 	`pnpm wrangler d1 execute prisma-demo-db --command "INSERT INTO  \"User\" (\"email\", \"name\") VALUES ('jane@prisma.io', 'Jane Doe (Local)');" --local`,
//  `pnpm prisma generate`
//
// We do this in the `preServe()` hook, in `serve.ts`, that is called from the `packages/vite-plugin-cloudflare/playground/vitest-setup.ts` file.

test("runs D1 query using Prisma", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual([
		{ id: 1, email: "jane@prisma.io", name: "Jane Doe (Local)" },
	]);
});
