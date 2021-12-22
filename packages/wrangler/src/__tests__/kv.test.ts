import { setMock, unsetAllMocks } from "./mock-cfetch";
import { runWrangler } from "./run-wrangler";
import { runInTempDir } from "./run-in-tmp";
import { writeFileSync } from "fs";

describe("wrangler", () => {
  runInTempDir();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("kv:namespace", () => {
    describe("create", () => {
      function mockCreateRequest(expectedTitle: string) {
        setMock(
          "/accounts/:accountId/storage/kv/namespaces",
          "POST",
          ([_url, accountId], { body }) => {
            expect(accountId).toEqual("some-account-id");
            const title = JSON.parse(body).title;
            expect(title).toEqual(expectedTitle);
            return { id: "some-namespace-id" };
          }
        );
      }

      it("should error if no namespace is given", async () => {
        const { stdout, stderr } = await runWrangler("kv:namespace create");
        expect(stdout).toMatchInlineSnapshot(`""`);
        expect(stderr).toMatchInlineSnapshot(`
          "wrangler kv:namespace create <namespace>

          Create a new namespace

          Positionals:
            namespace  The name of the new namespace  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local    Run on my machine  [boolean] [default: false]
                --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          Not enough non-option arguments: got 0, need at least 1"
        `);
      });

      it("should error if the namespace to create contains spaces", async () => {
        const { stdout, stderr } = await runWrangler(
          "kv:namespace create abc def ghi"
        );
        expect(stdout).toMatchInlineSnapshot(`""`);
        expect(stderr).toMatchInlineSnapshot(`
          "wrangler kv:namespace create <namespace>

          Create a new namespace

          Positionals:
            namespace  The name of the new namespace  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local    Run on my machine  [boolean] [default: false]
                --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          Unexpected additional positional arguments \\"def ghi\\"."
        `);
      });

      it("should error if the namespace to create is not valid", async () => {
        const { stdout, stderr } = await runWrangler(
          "kv:namespace create abc-def"
        );
        expect(stdout).toMatchInlineSnapshot(`""`);
        expect(stderr).toMatchInlineSnapshot(`
          "wrangler kv:namespace create <namespace>

          Create a new namespace

          Positionals:
            namespace  The name of the new namespace  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local    Run on my machine  [boolean] [default: false]
                --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          The namespace binding name \\"abc-def\\" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number."
        `);
      });

      it("should create a namespace", async () => {
        mockCreateRequest("worker-UnitTestNamespace");
        const { stdout } = await runWrangler(
          "kv:namespace create UnitTestNamespace"
        );
        expect(stdout).toMatchInlineSnapshot(`
          "🌀 Creating namespace with title \\"worker-UnitTestNamespace\\"
          ✨ Success!
          Add the following to your configuration file in your kv_namespaces array:
          { binding = \\"UnitTestNamespace\\", id = \\"some-namespace-id\\" }"
        `);
      });

      it("should create a preview namespace if configured to do so", async () => {
        mockCreateRequest("worker-UnitTestNamespace_preview");
        const { stdout } = await runWrangler(
          "kv:namespace create UnitTestNamespace --preview"
        );
        expect(stdout).toMatchInlineSnapshot(`
          "🌀 Creating namespace with title \\"worker-UnitTestNamespace_preview\\"
          ✨ Success!
          Add the following to your configuration file in your kv_namespaces array:
          { binding = \\"UnitTestNamespace\\", preview_id = \\"some-namespace-id\\" }"
        `);
      });

      it("should create a namespace using configured worker name", async () => {
        writeFileSync("./wrangler.toml", 'name = "otherWorker"', "utf-8");
        mockCreateRequest("otherWorker-UnitTestNamespace");
        const { stdout } = await runWrangler(
          "kv:namespace create UnitTestNamespace"
        );
        expect(stdout).toMatchInlineSnapshot(`
            "🌀 Creating namespace with title \\"otherWorker-UnitTestNamespace\\"
            ✨ Success!
            Add the following to your configuration file in your kv_namespaces array:
            { binding = \\"UnitTestNamespace\\", id = \\"some-namespace-id\\" }"
            `);
      });

      it("should create a namespace in an environment if configured to do so", async () => {
        mockCreateRequest("worker-customEnv-UnitTestNamespace");
        const { stdout } = await runWrangler(
          "kv:namespace create UnitTestNamespace --env customEnv"
        );
        expect(stdout).toMatchInlineSnapshot(`
          "🌀 Creating namespace with title \\"worker-customEnv-UnitTestNamespace\\"
          ✨ Success!
          Add the following to your configuration file in your kv_namespaces array under [env.customEnv]:
          { binding = \\"UnitTestNamespace\\", id = \\"some-namespace-id\\" }"
        `);
      });
    });

    describe("list", () => {
      function mockListRequest(namespaces: unknown[]) {
        const requests = { count: 0 };
        setMock(
          "/accounts/:accountId/storage/kv/namespaces\\?:qs",
          ([_url, accountId, query], init) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(query).toContain("per_page=100");
            expect(query).toContain("order=title");
            expect(query).toContain("direction=asc");
            expect(query).toContain("page=");
            expect(init).toBe(undefined);
            const pageSize = Number(/\bper_page=(\d+)\b/.exec(query)[1]);
            const page = Number(/\bpage=(\d+)/.exec(query)[1]);
            return namespaces.slice((page - 1) * pageSize, page * pageSize);
          }
        );
        return requests;
      }

      it("should list namespaces", async () => {
        const KVNamespaces = [
          { title: "title-1", id: "id-1" },
          { title: "title-2", id: "id-2" },
        ];
        mockListRequest(KVNamespaces);
        const { stdout } = await runWrangler("kv:namespace list");
        const namespaces = JSON.parse(stdout);
        expect(namespaces).toEqual(KVNamespaces);
      });

      it("should make multiple requests for paginated results", async () => {
        // Create a lot of mock namespaces, so that the cfetch requests will be paginated
        const KVNamespaces = [];
        for (let i = 0; i < 550; i++) {
          KVNamespaces.push({ title: "title-" + i, id: "id-" + i });
        }
        const requests = mockListRequest(KVNamespaces);
        const { stdout } = await runWrangler("kv:namespace list");
        const namespaces = JSON.parse(stdout);
        expect(namespaces).toEqual(KVNamespaces);
        expect(requests.count).toEqual(6);
      });
    });

    describe("delete", () => {
      function mockDeleteRequest(expectedNamespaceId: string) {
        const requests = { count: 0 };
        setMock(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId",
          "DELETE",
          ([_url, accountId, namespaceId]) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            return null;
          }
        );
        return requests;
      }

      function writeWranglerConfig() {
        writeFileSync(
          "./wrangler.toml",
          [
            'name = "otherWorker"',
            "kv_namespaces = [",
            '  { binding = "someBinding", id = "bound-id", preview_id = "preview-bound-id" }',
            "]",
            "",
            "[env.some-environment]",
            "kv_namespaces = [",
            '  { binding = "someBinding", id = "env-bound-id", preview_id = "preview-env-bound-id" }',
            "]",
          ].join("\n"),
          "utf-8"
        );
      }

      it("should delete a namespace specified by id", async () => {
        const requests = mockDeleteRequest("some-namespace-id");
        await runWrangler(
          `kv:namespace delete --namespace-id some-namespace-id`
        );
        expect(requests.count).toEqual(1);
      });

      it("should delete a namespace specified by binding name", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("bound-id");
        await runWrangler(`kv:namespace delete --binding someBinding`);
        expect(requests.count).toEqual(1);
      });

      it("should delete a preview namespace specified by binding name", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("preview-bound-id");
        await runWrangler(
          `kv:namespace delete --binding someBinding --preview`
        );
        expect(requests.count).toEqual(1);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        const { stderr } = await runWrangler(
          `kv:namespace delete --binding otherBinding`
        );
        expect(stderr).toMatchInlineSnapshot(`
          "wrangler kv:namespace delete

          Deletes a given namespace.

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The name of the namespace to delete  [string]
                --namespace-id  The id of the namespace to delete  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
          Not able to delete namespace.
          A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."
        `);
      });

      it("should delete a namespace specified by binding name in a given environment", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("env-bound-id");
        await runWrangler(
          `kv:namespace delete --binding someBinding --env some-environment`
        );
        expect(requests.count).toEqual(1);
      });

      it("should delete a preview namespace specified by binding name in a given environment", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("preview-env-bound-id");
        await runWrangler(
          `kv:namespace delete --binding someBinding --env some-environment --preview`
        );
        expect(requests.count).toEqual(1);
      });
    });
  });
});
