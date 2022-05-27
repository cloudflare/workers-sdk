import { mkdirSync, writeFileSync } from "node:fs";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
  createFetchResult,
  setMockRawResponse,
  setMockResponse,
  unsetAllMocks,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { Deployment, Project, UploadPayloadFile } from "../pages";
import type { FormData, RequestInit } from "undici";

// Asserting within mock responses get swallowed, so run them out-of-band
const outOfBandTests: (() => void)[] = [];
function assertLater(fn: () => void) {
  outOfBandTests.push(fn);
}

function mockGetToken(jwt: string) {
  setMockResponse(
    "/accounts/:accountId/pages/projects/foo/upload-token",
    async ([_url, accountId]) => {
      assertLater(() => {
        expect(accountId).toEqual("some-account-id");
      });

      return { jwt };
    }
  );
}

describe("pages", () => {
  runInTempDir();
  const std = mockConsoleMethods();
  function endEventLoop() {
    return new Promise((resolve) => setImmediate(resolve));
  }
  beforeEach(() => {
    outOfBandTests.length = 0;
  });
  afterEach(() => {
    outOfBandTests.forEach((fn) => fn());
  });

  it("should should display a list of available subcommands, for pages with no subcommand", async () => {
    await runWrangler("pages");
    await endEventLoop();

    expect(std.out).toMatchInlineSnapshot(`
      "wrangler pages

      ⚡️ Configure Cloudflare Pages

      Commands:
        wrangler pages dev [directory] [-- command..]  🧑‍💻 Develop your full-stack Pages application locally
        wrangler pages project                         ⚡️ Interact with your Pages projects
        wrangler pages deployment                      🚀 Interact with the deployments of a project
        wrangler pages publish [directory]             🆙 Publish a directory of static assets as a Pages deployment

      Flags:
        -c, --config   Path to .toml configuration file  [string]
        -h, --help     Show help  [boolean]
        -v, --version  Show version number  [boolean]

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

      expect(std.out).toMatchInlineSnapshot(`
        "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
      `);
    });

    it("should display for pages:functions:build", async () => {
      await expect(runWrangler("pages functions build")).rejects.toThrowError();

      expect(std.out).toMatchInlineSnapshot(`
        "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose

        [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
      `);
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
          const pageSize = Number(query.get("per_page"));
          const page = Number(query.get("page"));
          const expectedPageSize = 10;
          const expectedPage = requests.count;
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
            expect(pageSize).toEqual(expectedPageSize);
            expect(page).toEqual(expectedPage);
            expect(init).toEqual({});
          });
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

    it("should create a project with a production branch", async () => {
      setMockResponse(
        "/accounts/:accountId/pages/projects",
        ([_url, accountId], init) => {
          const body = JSON.parse(init.body as string);
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
            expect(init.method).toEqual("POST");
            expect(body).toEqual({
              name: "a-new-project",
              production_branch: "main",
            });
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
          assertLater(() => {
            expect(project).toEqual("images");
            expect(accountId).toEqual("some-account-id");
          });
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
      await runWrangler("pages deployment list --project-name=images");

      expect(requests.count).toBe(1);
    });
  });

  describe("deployment create", () => {
    let actualProcessEnvCI: string | undefined;

    mockAccountId();
    mockApiToken();
    runInTempDir();

    beforeEach(() => {
      actualProcessEnvCI = process.env.CI;
      process.env.CI = "true";
    });

    afterEach(() => {
      unsetAllMocks();
      process.env.CI = actualProcessEnvCI;
    });

    it("should be aliased with 'wrangler pages publish'", async () => {
      await runWrangler("pages publish --help");
      await endEventLoop();

      expect(std.out).toMatchInlineSnapshot(`
        "wrangler pages publish [directory]

        🆙 Publish a directory of static assets as a Pages deployment

        Positionals:
          directory  The directory of static files to upload  [string]

        Flags:
          -c, --config   Path to .toml configuration file  [string]
          -h, --help     Show help  [boolean]
          -v, --version  Show version number  [boolean]

        Options:
              --project-name    The name of the project you want to deploy to  [string]
              --branch          The name of the branch you want to deploy to  [string]
              --commit-hash     The SHA to attach to this deployment  [string]
              --commit-message  The commit message to attach to this deployment  [string]
              --commit-dirty    Whether or not the workspace should be considered dirty for this deployment  [boolean]

        🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose"
      `);
    });

    it("should upload a directory of files", async () => {
      writeFileSync("logo.png", "foobar");

      setMockResponse(
        "/accounts/:accountId/pages/projects/foo/upload-token",
        async ([_url, accountId]) => {
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
          });

          return {
            jwt: "<<funfetti-auth-jwt>>",
          };
        }
      );

      setMockResponse(
        "/pages/assets/check-missing",
        "POST",
        async (_, init) => {
          const body = JSON.parse(init.body as string) as { hashes: string[] };
          assertLater(() => {
            expect(init.headers).toMatchObject({
              Authorization: "Bearer <<funfetti-auth-jwt>>",
            });
            expect(body).toMatchObject({
              hashes: ["2082190357cfd3617ccfe04f340c6247"],
            });
          });
          return body.hashes;
        }
      );

      setMockResponse("/pages/assets/upload", "POST", async (_, init) => {
        assertLater(() => {
          expect(init.headers).toMatchObject({
            Authorization: "Bearer <<funfetti-auth-jwt>>",
          });
          const body = JSON.parse(init.body as string) as UploadPayloadFile[];
          expect(body).toMatchObject([
            {
              key: "2082190357cfd3617ccfe04f340c6247",
              value: Buffer.from("foobar").toString("base64"),
              metadata: {
                contentType: "image/png",
              },
              base64: true,
            },
          ]);
        });
      });

      setMockResponse(
        "/accounts/:accountId/pages/projects/foo/deployments",
        async ([_url, accountId], init) => {
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
            expect(init.method).toEqual("POST");
            const body = init.body as FormData;
            const manifest = JSON.parse(body.get("manifest") as string);
            expect(manifest).toMatchInlineSnapshot(`
            Object {
              "/logo.png": "2082190357cfd3617ccfe04f340c6247",
            }
          `);
          });

          return {
            url: "https://abcxyz.foo.pages.dev/",
          };
        }
      );

      await runWrangler("pages publish . --project-name=foo");

      // TODO: Unmounting somehow loses this output

      // expect(std.out).toMatchInlineSnapshot(`
      //   "✨ Success! Uploaded 1 files (TIMINGS)

      //   ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
      // `);
    });

    it("should retry uploads", async () => {
      writeFileSync("logo.txt", "foobar");

      mockGetToken("<<funfetti-auth-jwt>>");

      setMockResponse(
        "/pages/assets/check-missing",
        "POST",
        async (_, init) => {
          const body = JSON.parse(init.body as string) as { hashes: string[] };
          assertLater(() => {
            expect(init.headers).toMatchObject({
              Authorization: "Bearer <<funfetti-auth-jwt>>",
            });
            expect(body).toMatchObject({
              hashes: ["1a98fb08af91aca4a7df1764a2c4ddb0"],
            });
          });
          return body.hashes;
        }
      );

      // Accumulate multiple requests then assert afterwards
      const requests: RequestInit[] = [];
      setMockRawResponse("/pages/assets/upload", "POST", async (_, init) => {
        requests.push(init);

        if (requests.length < 2) {
          return createFetchResult(null, false, [
            {
              code: 800000,
              message: "Something exploded, please retry",
            },
          ]);
        } else {
          return createFetchResult(null, true);
        }
      });

      setMockResponse(
        "/accounts/:accountId/pages/projects/foo/deployments",
        async ([_url, accountId], init) => {
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
            expect(init.method).toEqual("POST");
            const body = init.body as FormData;
            const manifest = JSON.parse(body.get("manifest") as string);
            expect(manifest).toMatchInlineSnapshot(`
            Object {
              "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
            }
          `);
          });

          return {
            url: "https://abcxyz.foo.pages.dev/",
          };
        }
      );

      await runWrangler("pages publish . --project-name=foo");

      // Assert two identical requests
      expect(requests.length).toBe(2);
      for (const init of requests) {
        assertLater(() => {
          expect(init.headers).toMatchObject({
            Authorization: "Bearer <<funfetti-auth-jwt>>",
          });

          const body = JSON.parse(init.body as string) as UploadPayloadFile[];
          expect(body).toMatchObject([
            {
              key: "1a98fb08af91aca4a7df1764a2c4ddb0",
              value: Buffer.from("foobar").toString("base64"),
              metadata: {
                contentType: "text/plain",
              },
              base64: true,
            },
          ]);
        });
      }

      expect(std.out).toMatchInlineSnapshot(`
        "✨ Success! Uploaded 1 files (TIMINGS)

        ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
      `);
    });

    it("should try to use multiple buckets (up to the max concurrency)", async () => {
      writeFileSync("logo.txt", "foobar");
      writeFileSync("logo.png", "foobar");
      writeFileSync("logo.html", "foobar");
      writeFileSync("logo.js", "foobar");

      mockGetToken("<<funfetti-auth-jwt>>");

      setMockResponse(
        "/pages/assets/check-missing",
        "POST",
        async (_, init) => {
          const body = JSON.parse(init.body as string) as { hashes: string[] };
          assertLater(() => {
            expect(init.headers).toMatchObject({
              Authorization: "Bearer <<funfetti-auth-jwt>>",
            });
            expect(body).toMatchObject({
              hashes: expect.arrayContaining([
                "d96fef225537c9f5e44a3cb27fd0b492",
                "2082190357cfd3617ccfe04f340c6247",
                "6be321bef99e758250dac034474ddbb8",
                "1a98fb08af91aca4a7df1764a2c4ddb0",
              ]),
            });
          });
          return body.hashes;
        }
      );

      // Accumulate multiple requests then assert afterwards
      const requests: RequestInit[] = [];
      setMockResponse("/pages/assets/upload", "POST", async (_, init) => {
        requests.push(init);
      });

      setMockResponse(
        "/accounts/:accountId/pages/projects/foo/deployments",
        async ([_url, accountId], init) => {
          assertLater(() => {
            expect(accountId).toEqual("some-account-id");
            expect(init.method).toEqual("POST");
            const body = init.body as FormData;
            const manifest = JSON.parse(body.get("manifest") as string);
            expect(manifest).toMatchInlineSnapshot(`
            Object {
              "/logo.html": "d96fef225537c9f5e44a3cb27fd0b492",
              "/logo.js": "6be321bef99e758250dac034474ddbb8",
              "/logo.png": "2082190357cfd3617ccfe04f340c6247",
              "/logo.txt": "1a98fb08af91aca4a7df1764a2c4ddb0",
            }
          `);
          });

          return {
            url: "https://abcxyz.foo.pages.dev/",
          };
        }
      );

      await runWrangler("pages publish . --project-name=foo");

      // We have 3 buckets, so expect 3 uploads
      expect(requests.length).toBe(3);
      const bodies: UploadPayloadFile[][] = [];
      for (const init of requests) {
        expect(init.headers).toMatchObject({
          Authorization: "Bearer <<funfetti-auth-jwt>>",
        });
        bodies.push(JSON.parse(init.body as string) as UploadPayloadFile[]);
      }
      // First bucket should end up with 2 files
      expect(bodies.map((b) => b.length)).toEqual([2, 1, 1]);
      // But we don't know the order, so flatten and test without ordering
      expect(bodies.flatMap((b) => b)).toEqual(
        expect.arrayContaining([
          {
            base64: true,
            key: "d96fef225537c9f5e44a3cb27fd0b492",
            metadata: { contentType: "text/html" },
            value: "Zm9vYmFy",
          },
          {
            base64: true,
            key: "1a98fb08af91aca4a7df1764a2c4ddb0",
            metadata: { contentType: "text/plain" },
            value: "Zm9vYmFy",
          },
          {
            base64: true,
            key: "6be321bef99e758250dac034474ddbb8",
            metadata: { contentType: "application/javascript" },
            value: "Zm9vYmFy",
          },
          {
            base64: true,
            key: "2082190357cfd3617ccfe04f340c6247",
            metadata: { contentType: "image/png" },
            value: "Zm9vYmFy",
          },
        ])
      );

      expect(std.out).toMatchInlineSnapshot(`
        "✨ Success! Uploaded 4 files (TIMINGS)

        ✨ Deployment complete! Take a peek over at https://abcxyz.foo.pages.dev/"
      `);
    });

    it("should not error when directory names contain periods and houses a extensionless file", async () => {
      mkdirSync(".well-known");
      // Note: same content as previous test, but since it's a different extension,
      // it hashes to a different value
      writeFileSync(".well-known/foobar", "foobar");

      mockGetToken("<<funfetti-auth-jwt>>");

      setMockResponse(
        "/pages/assets/check-missing",
        "POST",
        async (_, init) => {
          const body = JSON.parse(init.body as string) as { hashes: string[] };
          assertLater(() => {
            expect(init.headers).toMatchObject({
              Authorization: "Bearer <<funfetti-auth-jwt>>",
            });
            expect(body).toMatchObject({
              hashes: ["7b764dacfd211bebd8077828a7ddefd7"],
            });
          });
          return body.hashes;
        }
      );

      setMockResponse("/pages/assets/upload", "POST", async (_, init) => {
        assertLater(() => {
          expect(init.headers).toMatchObject({
            Authorization: "Bearer <<funfetti-auth-jwt>>",
          });
          const body = JSON.parse(init.body as string) as UploadPayloadFile[];
          expect(body).toMatchObject([
            {
              key: "7b764dacfd211bebd8077828a7ddefd7",
              value: Buffer.from("foobar").toString("base64"),
              metadata: {
                contentType: "application/octet-stream",
              },
              base64: true,
            },
          ]);
        });
      });

      setMockResponse(
        "/accounts/:accountId/pages/projects/foo/deployments",
        async () => ({
          url: "https://abcxyz.foo.pages.dev/",
        })
      );

      await runWrangler("pages publish . --project-name=foo");

      expect(std.err).toMatchInlineSnapshot(`""`);
    });
  });
});
