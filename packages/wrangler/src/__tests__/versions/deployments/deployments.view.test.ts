import { describe, test } from "vitest";
import { UserError } from "../../../errors";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runWrangler } from "../../helpers/run-wrangler";

describe("deployments view", () => {
	mockConsoleMethods();

	test("error when run with no args", async ({ expect }) => {
		const result = runWrangler("deployments view  --x-versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: \`wrangler deployments view\` has been renamed \`wrangler deployments status --x-versions\`. Please use that command instead.]`
		);
		await expect(result).rejects.toBeInstanceOf(UserError);
	});

	test("error when run with positional arg", async ({ expect }) => {
		const result = runWrangler("deployments view dummy-id  --x-versions");

		await expect(result).rejects.toMatchInlineSnapshot(
			`[Error: \`wrangler deployments view <deployment-id>\` has been renamed \`wrangler versions view [version-id] --x-versions\`. Please use that command instead.]`
		);
		await expect(result).rejects.toBeInstanceOf(UserError);
	});
});
