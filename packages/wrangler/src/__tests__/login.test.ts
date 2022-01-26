import { runWrangler } from "./run-wrangler";
import { initialise } from "../user";
import { mockConsoleMethods } from "./mock-console";

describe("login", () => {
  const std = mockConsoleMethods();

  describe("--scopes-list", () => {
    it("should display a list of available scopes", async () => {
      await initialise();
      await runWrangler("login --scopes-list");
      expect(std.out).toContain("Available scopes:");
      expect(std.out).toMatch(/Scope .* Description/);
      expect(std.out).toMatch(
        / account:read .* See your account info such as account details, analytics, and memberships\. /
      );
      expect(std.out).toMatch(
        / user:read .* See your user info such as name, email address, and account memberships\. /
      );
      expect(std.out).toMatch(
        / workers:write .* See and change Cloudflare Workers data such as zones, KV storage, namespaces, scripts, and routes\. /
      );
      expect(std.out).toMatch(
        / workers_kv:write .* See and change Cloudflare Workers KV Storage data such as keys and namespaces\. /
      );
      expect(std.out).toMatch(
        / workers_routes:write .* See and change Cloudflare Workers data such as filters and routes\. /
      );
      expect(std.out).toMatch(
        / workers_scripts:write .* See and change Cloudflare Workers scripts, durable objects, subdomains, triggers, and tail data\. /
      );
      expect(std.out).toMatch(
        / workers_tail:read .* See Cloudflare Workers tail and script data\. /
      );
      expect(std.out).toMatch(
        / zone:read .* Grants read level access to account zone\. /
      );
    });
  });
});
