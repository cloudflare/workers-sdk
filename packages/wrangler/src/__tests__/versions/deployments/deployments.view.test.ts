import { runWrangler } from "../../helpers/run-wrangler";

describe("deployments view", () => {
	test("depracted error when run with no args", async () => {
		const result = runWrangler("deployments view  --x-versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: \`wrangler deployments view\` is deprecated and will be removed in a future major version. Please use \`wrangler deployments status --x-versions\` instead.]`
		);
	});
	test("depracted error when run with positional arg", async () => {
		const result = runWrangler("deployments view dummy-id  --x-versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: \`wrangler deployments view <deployment-id>\` is deprecated and will be removed in a future major version. Deployment ID is now referred to as Version ID. Please use \`wrangler versions view [version-id] --x-versions\` instead.]`
		);
	});
});
