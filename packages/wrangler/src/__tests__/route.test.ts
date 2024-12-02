import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler route", () => {
	mockConsoleMethods();
	runInTempDir();

	it("shows a deprecation notice when `wrangler route` is run", async () => {
		await expect(
			runWrangler("route")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Unknown argument: route]`
		);
	});

	it("shows a deprecation notice when `wrangler route delete` is run", async () => {
		await expect(
			runWrangler("route delete")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Unknown arguments: route, delete]`
		);
	});

	it("shows a deprecation notice when `wrangler route delete <id>` is run", async () => {
		await expect(
			runWrangler("route delete some-zone-id")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Unknown arguments: route, delete, some-zone-id]`
		);
	});

	it("shows a deprecation notice when `wrangler route list` is run", async () => {
		await expect(
			runWrangler("route list")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Unknown arguments: route, list]`
		);
	});
});
