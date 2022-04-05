import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Project } from "../pages";

describe("subcommand implicit help ran on incomplete command execution", () => {
  runInTempDir();
  const std = mockConsoleMethods();
  function endEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
  }

  it("should should display a list of available subcommands, for pages with no subcommand", async () => {
    await runWrangler("pages");
    await endEventLoop();

    expect(std.out).toMatchInlineSnapshot(`
      "wrangler pages

      ⚡️ Configure Cloudflare Pages

      Commands:
        wrangler pages dev [directory] [-- command]  🧑‍💻 Develop your full-stack Pages application locally

      Flags:
        -c, --config      Path to .toml configuration file  [string]
        -h, --help        Show help  [boolean]
        -v, --version     Show version number  [boolean]
            --legacy-env  Use legacy environments  [boolean]

      🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
    `);
  });

  describe("beta message for subcommands", () => {
    it("should display for pages:dev", async () => {
      await expect(
        runWrangler("pages dev")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Must specify a directory of static assets to serve or a command to run."`
      );

      expect(std.out).toMatchInlineSnapshot(
        `"🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"`
      );
    });

    // Note that `wrangler pages functions` does nothing...

    it("should display for pages:functions:build", async () => {
      await expect(runWrangler("pages functions build")).rejects.toThrowError();

      expect(std.out).toMatchInlineSnapshot(
        `"🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"`
      );
    });
  });

  describe("project list", () => {
    mockAccountId();
    mockApiToken();

    afterEach(() => {
      unsetAllMocks();
    });
    function mockListRequest(projects: unknown[]) {
      const requests = { count: 0 };
      setMockResponse(
        "/accounts/:accountId/pages/projects",
        ([_url, accountId], init, query) => {
          requests.count++;
          expect(accountId).toEqual("some-account-id");
          expect(query.get("per_page")).toEqual("10");
          expect(query.get("page")).toEqual(`${requests.count}`);
          expect(init).toEqual({});
          const pageSize = Number(query.get("per_page"));
          const page = Number(query.get("page"));
          return namespaces.slice((page - 1) * pageSize, page * pageSize);
        }
      );
      return requests;
    }

    it("should make request to list projects", async () => {
      const projects: Project[] = [
        {
          name: "dogs",
          domains: ["dogs.pages.dev"],
          source: {
            type: "github",
          },
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
        },
        {
          name: "cats",
          domains: ["cats.pages.dev", "kitten.pages.dev"],
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
        },
      ];

      const requests = mockListRequest(projects);
      await runWrangler("pages project list");

      expect(requests.count).toBe(1);
    });

    it("should make multiple requests for paginated results", async () => {
      const projects: Project[] = [];
      for (let i = 0; i < 15; i++) {
        projects.push({
          name: "dogs" + i,
          domains: [i + "dogs.pages.dev"],
          source: {
            type: "github",
          },
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
        });
      }
      const requests = mockListRequest(projects);
      await runWrangler("pages project list");
      expect(requests.count).toEqual(2);
    });
  });
});
