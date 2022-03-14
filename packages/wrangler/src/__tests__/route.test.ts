import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler route", () => {
  runInTempDir();

  it("shows a deprecation notice when `wrangler route` is run", async () => {
    await expect(runWrangler("route")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "DEPRECATION WARNING:
            \`wrangler route\` has been deprecated.
            Please use wrangler.toml and/or \`wrangler publish --routes\` to modify routes"
          `);
  });

  it("shows a deprecation notice when `wrangler route delete` is run", async () => {
    await expect(runWrangler("route delete")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "DEPRECATION WARNING:
            \`wrangler route delete\` has been deprecated.
            Modify wrangler.toml to update the routes your worker will be deployed to upon publishing.
            Use the Cloudflare Dashboard to unassign a worker from existing routes"
          `);
  });

  it("shows a deprecation notice when `wrangler route delete <id>` is run", async () => {
    await expect(runWrangler("route delete some-zone-id")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "DEPRECATION WARNING:
            \`wrangler route delete\` has been deprecated.
            Modify wrangler.toml to update the routes your worker will be deployed to upon publishing.
            Use the Cloudflare Dashboard to unassign a worker from existing routes"
          `);
  });

  it("shows a deprecation notice when `wrangler route list` is run", async () => {
    await expect(runWrangler("route list")).rejects
      .toThrowErrorMatchingInlineSnapshot(`
            "DEPRECATION WARNING:
            \`wrangler route list\` has been deprecated.
            Refer to wrangler.toml for a list of routes the worker will be deployed to upon publishing.
            Refer to the Cloudflare Dashboard to see the routes this worker is currently running on."
          `);
  });
});
