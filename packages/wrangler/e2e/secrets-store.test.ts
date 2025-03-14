import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

describe("secrets-store", () => {
	const storeName = generateResourceName("secrets-store-store");
	// const secretName = generateResourceName("secrets-store-secret");
	const helper = new WranglerE2ETestHelper();

	it("creates a store", async () => {
		const normalize = (str: string) =>
			normalizeOutput(str, {
				[storeName]: "tmp-e2e-secrets-store-store",
				[process.env.CLOUDFLARE_ACCOUNT_ID as string]: "CLOUDFLARE_ACCOUNT_ID",
			});

		const output = await helper.run(
			`wrangler secrets-store store create --name=${storeName} --remote`
		);

		expect(normalize(output.stdout)).toMatchInlineSnapshot(`
			""
		`);
	});
});
