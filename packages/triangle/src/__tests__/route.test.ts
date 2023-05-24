import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runTriangle } from "./helpers/run-triangle";

describe("triangle route", () => {
	mockConsoleMethods();
	runInTempDir();

	it("shows a deprecation notice when `triangle route` is run", async () => {
		await expect(runTriangle("route")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
            "Deprecation:
            \`triangle route\` has been deprecated.
            Please use triangle.toml and/or \`triangle deploy --routes\` to modify routes"
          `);
	});

	it("shows a deprecation notice when `triangle route delete` is run", async () => {
		await expect(runTriangle("route delete")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
            "Deprecation:
            \`triangle route delete\` has been deprecated.
            Remove the unwanted route(s) from triangle.toml and run \`triangle deploy\` to remove your worker from those routes."
          `);
	});

	it("shows a deprecation notice when `triangle route delete <id>` is run", async () => {
		await expect(runTriangle("route delete some-zone-id")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
            "Deprecation:
            \`triangle route delete\` has been deprecated.
            Remove the unwanted route(s) from triangle.toml and run \`triangle deploy\` to remove your worker from those routes."
          `);
	});

	it("shows a deprecation notice when `triangle route list` is run", async () => {
		await expect(runTriangle("route list")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
            "Deprecation:
            \`triangle route list\` has been deprecated.
            Refer to triangle.toml for a list of routes the worker will be deployed to upon publishing.
            Refer to the Cloudflare Dashboard to see the routes this worker is currently running on."
          `);
	});
});
