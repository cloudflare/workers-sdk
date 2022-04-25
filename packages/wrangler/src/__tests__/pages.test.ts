import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse, unsetAllMocks } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Project, Deployment } from "../pages";

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
        wrangler pages project                       ⚡️ Interact with your Pages projects
        wrangler pages deployment                    🚀 Interact with the deployments of a project
        wrangler pages publish [directory]           🆙 Publish a directory of static assets as a Pages deployment

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
          return projects.slice((page - 1) * pageSize, page * pageSize);
        }
      );
      return requests;
    }

    it("should make request to list projects", async () => {
      const projects: Project[] = [
        {
          name: "dogs",
          subdomain: "docs.pages.dev",
          domains: ["dogs.pages.dev"],
          source: {
            type: "github",
          },
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
          created_on: "2021-11-17T14:52:26.133835Z",
          production_branch: "main",
        },
        {
          name: "cats",
          subdomain: "cats.pages.dev",
          domains: ["cats.pages.dev", "kitten.com"],
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
          created_on: "2021-11-17T14:52:26.133835Z",
          production_branch: "main",
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
          subdomain: i + "dogs.pages.dev",
          domains: [i + "dogs.pages.dev"],
          source: {
            type: "github",
          },
          latest_deployment: {
            modified_on: "2021-11-17T14:52:26.133835Z",
          },
          created_on: "2021-11-17T14:52:26.133835Z",
          production_branch: "main",
        });
      }
      const requests = mockListRequest(projects);
      await runWrangler("pages project list");
      expect(requests.count).toEqual(2);
    });
  });

  describe("project create", () => {
    mockAccountId();
    mockApiToken();

    afterEach(() => {
      unsetAllMocks();
    });

    it("should create a project with a the default production branch", async () => {
      setMockResponse(
        "/accounts/:accountId/pages/projects",
        ([_url, accountId], init) => {
          expect(accountId).toEqual("some-account-id");
          expect(init.method).toEqual("POST");
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({
            name: "a-new-project",
            production_branch: "production",
          });
          return {
            name: "a-new-project",
            subdomain: "a-new-project.pages.dev",
            production_branch: "production",
          };
        }
      );
      await runWrangler("pages project create a-new-project");
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
        To deploy a folder of assets, run 'wrangler pages publish [directory]'."
      `);
    });

    it("should create a project with a the default production branch", async () => {
      setMockResponse(
        "/accounts/:accountId/pages/projects",
        ([_url, accountId], init) => {
          expect(accountId).toEqual("some-account-id");
          expect(init.method).toEqual("POST");
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({
            name: "a-new-project",
            production_branch: "main",
          });
          return {
            name: "a-new-project",
            subdomain: "a-new-project.pages.dev",
            production_branch: "main",
          };
        }
      );
      await runWrangler(
        "pages project create a-new-project --production-branch=main"
      );
      expect(std.out).toMatchInlineSnapshot(`
        "✨ Successfully created the 'a-new-project' project. It will be available at https://a-new-project.pages.dev/ once you create your first deployment.
        To deploy a folder of assets, run 'wrangler pages publish [directory]'."
      `);
    });
  });

  describe("deployment list", () => {
    mockAccountId();
    mockApiToken();

    afterEach(() => {
      unsetAllMocks();
    });
    function mockListRequest(deployments: unknown[]) {
      const requests = { count: 0 };
      setMockResponse(
        "/accounts/:accountId/pages/projects/:project/deployments",
        ([_url, accountId, project]) => {
          requests.count++;
          expect(project).toEqual("images");
          expect(accountId).toEqual("some-account-id");
          return deployments;
        }
      );
      return requests;
    }

    it("should make request to list deployments", async () => {
      const deployments: Deployment[] = [
        {
          id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
          url: "https://87bbc8fe.images.pages.dev",
          environment: "preview",
          latest_stage: {
            ended_on: "2021-11-17T14:52:26.133835Z",
            status: "success",
          },
          deployment_trigger: {
            metadata: {
              branch: "main",
              commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
            },
          },
          project_name: "images",
        },
      ];

      const requests = mockListRequest(deployments);
      await runWrangler("pages deployment list --project=images");

      expect(requests.count).toBe(1);
    });
  });
});
