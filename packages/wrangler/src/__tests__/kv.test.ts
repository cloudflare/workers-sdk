import { writeFileSync } from "node:fs";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
  setMockResponse,
  unsetAllMocks,
  unsetMockFetchKVGetValues,
  setMockFetchKVGetValue,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockKeyListRequest } from "./helpers/mock-kv";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { KVNamespaceInfo } from "../kv";

describe("wrangler", () => {
  mockAccountId();
  mockApiToken();
  runInTempDir();
  const std = mockConsoleMethods();

  afterEach(() => {
    unsetAllMocks();
  });

  describe("kv:namespace", () => {
    describe("create", () => {
      function mockCreateRequest(expectedTitle: string) {
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces",
          "POST",
          ([_url, accountId], { body }) => {
            expect(accountId).toEqual("some-account-id");
            const title = JSON.parse(body as string).title;
            expect(title).toEqual(expectedTitle);
            return { id: "some-namespace-id" };
          }
        );
      }

      it("should error if no namespace is given", async () => {
        await expect(
          runWrangler("kv:namespace create")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Not enough non-option arguments: got 0, need at least 1"`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
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
        await expect(
          runWrangler("kv:namespace create abc def ghi")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Unexpected additional positional arguments \\"def ghi\\"."`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
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
        await expect(
          runWrangler("kv:namespace create abc-def")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"The namespace binding name \\"abc-def\\" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number."`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
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
        await runWrangler("kv:namespace create UnitTestNamespace");
        expect(std.out).toMatchInlineSnapshot(`
          "🌀 Creating namespace with title \\"worker-UnitTestNamespace\\"
          ✨ Success!
          Add the following to your configuration file in your kv_namespaces array:
          { binding = \\"UnitTestNamespace\\", id = \\"some-namespace-id\\" }"
        `);
      });

      it("should create a preview namespace if configured to do so", async () => {
        mockCreateRequest("worker-UnitTestNamespace_preview");
        await runWrangler("kv:namespace create UnitTestNamespace --preview");
        expect(std.out).toMatchInlineSnapshot(`
          "🌀 Creating namespace with title \\"worker-UnitTestNamespace_preview\\"
          ✨ Success!
          Add the following to your configuration file in your kv_namespaces array:
          { binding = \\"UnitTestNamespace\\", preview_id = \\"some-namespace-id\\" }"
        `);
      });

      it("should create a namespace using configured worker name", async () => {
        writeFileSync("./wrangler.toml", 'name = "otherWorker"', "utf-8");
        mockCreateRequest("otherWorker-UnitTestNamespace");
        await runWrangler("kv:namespace create UnitTestNamespace");
        expect(std.out).toMatchInlineSnapshot(`
            "🌀 Creating namespace with title \\"otherWorker-UnitTestNamespace\\"
            ✨ Success!
            Add the following to your configuration file in your kv_namespaces array:
            { binding = \\"UnitTestNamespace\\", id = \\"some-namespace-id\\" }"
            `);
      });

      it("should create a namespace in an environment if configured to do so", async () => {
        mockCreateRequest("worker-customEnv-UnitTestNamespace");
        await runWrangler(
          "kv:namespace create UnitTestNamespace --env customEnv"
        );
        expect(std.out).toMatchInlineSnapshot(`
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
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces",
          ([_url, accountId], init, query) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(query.get("per_page")).toEqual("100");
            expect(query.get("order")).toEqual("title");
            expect(query.get("direction")).toEqual("asc");
            expect(query.get("page")).toEqual(`${requests.count}`);
            expect(init).toEqual({});
            const pageSize = Number(query.get("per_page"));
            const page = Number(query.get("page"));
            return namespaces.slice((page - 1) * pageSize, page * pageSize);
          }
        );
        return requests;
      }

      it("should list namespaces", async () => {
        const kvNamespaces: KVNamespaceInfo[] = [
          { title: "title-1", id: "id-1" },
          { title: "title-2", id: "id-2" },
        ];
        mockListRequest(kvNamespaces);
        await runWrangler("kv:namespace list");

        expect(std.err).toMatchInlineSnapshot(`""`);
        const namespaces = JSON.parse(std.out);
        expect(namespaces).toEqual(kvNamespaces);
      });

      it("should make multiple requests for paginated results", async () => {
        // Create a lot of mock namespaces, so that the fetch requests will be paginated
        const kvNamespaces: KVNamespaceInfo[] = [];
        for (let i = 0; i < 550; i++) {
          kvNamespaces.push({ title: "title-" + i, id: "id-" + i });
        }
        const requests = mockListRequest(kvNamespaces);
        await runWrangler("kv:namespace list");
        const namespaces = JSON.parse(std.out);
        expect(namespaces).toEqual(kvNamespaces);
        expect(requests.count).toEqual(6);
      });
    });

    describe("delete", () => {
      function mockDeleteRequest(expectedNamespaceId: string) {
        const requests = { count: 0 };
        setMockResponse(
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
        await runWrangler(
          `kv:namespace delete --binding someBinding --preview false`
        );
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
        await expect(runWrangler("kv:namespace delete --binding otherBinding"))
          .rejects.toThrowErrorMatchingInlineSnapshot(`
                "Not able to delete namespace.
                A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."
              `);
        expect(std.err).toMatchInlineSnapshot(`
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
          "kv:namespace delete --binding someBinding --env some-environment --preview false"
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
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

  describe("kv:key", () => {
    describe("put", () => {
      function mockKeyPutRequest(
        expectedNamespaceId: string,
        expectedKey: string,
        expectedValue: string,
        expiration?: number,
        expirationTtl?: number
      ) {
        const requests = { count: 0 };
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
          "PUT",
          ([_url, accountId, namespaceId, key], { body }, query) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            expect(key).toEqual(expectedKey);
            expect(body).toEqual(expectedValue);
            if (expiration !== undefined) {
              expect(query.get("expiration")).toEqual(`${expiration}`);
            } else {
              expect(query.has("expiration")).toBe(false);
            }
            if (expirationTtl) {
              expect(query.get("expiration_ttl")).toEqual(`${expirationTtl}`);
            } else {
              expect(query.has("expiration_ttl")).toBe(false);
            }
            return null;
          }
        );
        return requests;
      }

      it("should put a key in a given namespace specified by namespace-id", async () => {
        const requests = mockKeyPutRequest(
          "some-namespace-id",
          "my-key",
          "my-value"
        );

        await runWrangler(
          "kv:key put my-key my-value --namespace-id some-namespace-id"
        );

        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should put a key in a given namespace specified by binding", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest("bound-id", "my-key", "my-value");
        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --preview false"
        );

        expect(std.out).toMatchInlineSnapshot(
          `"writing the value \\"my-value\\" to key \\"my-key\\" on namespace bound-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should put a key in a given preview namespace specified by binding", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest(
          "preview-bound-id",
          "my-key",
          "my-value"
        );

        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --preview"
        );

        expect(std.out).toMatchInlineSnapshot(
          `"writing the value \\"my-value\\" to key \\"my-key\\" on namespace preview-bound-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should add expiration and ttl properties when putting a key", async () => {
        const requests = mockKeyPutRequest(
          "some-namespace-id",
          "my-key",
          "my-value",
          10,
          20
        );
        await runWrangler(
          "kv:key put my-key my-value --namespace-id some-namespace-id --expiration 10 --ttl 20"
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should put a key to the specified environment in a given namespace", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest(
          "env-bound-id",
          "my-key",
          "my-value"
        );
        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --env some-environment --preview false"
        );
        expect(std.out).toMatchInlineSnapshot(
          `"writing the value \\"my-value\\" to key \\"my-key\\" on namespace env-bound-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should put a key with a value loaded from a given path", async () => {
        writeFileSync("foo.txt", "file-contents", "utf-8");
        const requests = mockKeyPutRequest(
          "some-namespace-id",
          "my-key",
          "file-contents"
        );
        await runWrangler(
          "kv:key put my-key --namespace-id some-namespace-id --path foo.txt"
        );
        expect(std.out).toMatchInlineSnapshot(
          `"writing the contents of foo.txt to the key \\"my-key\\" on namespace some-namespace-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should error if no key is provided", async () => {
        await expect(
          runWrangler("kv:key put")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Not enough non-option arguments: got 0, need at least 1"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to.  [string] [required]
            value  The value to write.  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The binding of the namespace to write to.  [string]
                --namespace-id  The id of the namespace to write to.  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible.  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path.  [string]

          Not enough non-option arguments: got 0, need at least 1"
        `);
      });

      it("should error if no binding nor namespace is provided", async () => {
        await expect(
          runWrangler("kv:key put foo bar")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments binding and namespace-id is required"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to.  [string] [required]
            value  The value to write.  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The binding of the namespace to write to.  [string]
                --namespace-id  The id of the namespace to write to.  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible.  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path.  [string]

          Exactly one of the arguments binding and namespace-id is required"
        `);
      });

      it("should error if both binding and namespace is provided", async () => {
        await expect(
          runWrangler("kv:key put foo bar --binding x --namespace-id y")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments binding and namespace-id are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to.  [string] [required]
            value  The value to write.  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The binding of the namespace to write to.  [string]
                --namespace-id  The id of the namespace to write to.  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible.  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path.  [string]

          Arguments binding and namespace-id are mutually exclusive"
        `);
      });

      it("should error if no value nor path is provided", async () => {
        await expect(
          runWrangler("kv:key put key --namespace-id 12345")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments value and path is required"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to.  [string] [required]
            value  The value to write.  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The binding of the namespace to write to.  [string]
                --namespace-id  The id of the namespace to write to.  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible.  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path.  [string]

          Exactly one of the arguments value and path is required"
        `);
      });

      it("should error if both value and path is provided", async () => {
        await expect(
          runWrangler("kv:key put key value --path xyz --namespace-id 12345")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments value and path are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to.  [string] [required]
            value  The value to write.  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The binding of the namespace to write to.  [string]
                --namespace-id  The id of the namespace to write to.  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible.  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path.  [string]

          Arguments value and path are mutually exclusive"
        `);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler("kv:key put key value --binding otherBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

          [32m%s[0m
          If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
      });

      it("should error if a given binding has both preview and non-preview and --preview is not specified", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest(
          "preview-bound-id",
          "my-key",
          "my-value"
        );
        await expect(
          runWrangler("kv:key put my-key my-value --binding someBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"someBinding has both a namespace ID and a preview ID. Specify \\"--preview\\" or \\"--preview false\\" to avoid writing data to the wrong namespace."`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "someBinding has both a namespace ID and a preview ID. Specify \\"--preview\\" or \\"--preview false\\" to avoid writing data to the wrong namespace.

          [32m%s[0m
          If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
        expect(requests.count).toEqual(0);
      });
    });

    describe("list", () => {
      it("should list the keys of a namespace specified by namespace-id", async () => {
        const keys = ["key-1", "key-2", "key-3"];
        mockKeyListRequest("some-namespace-id", keys);
        await runWrangler("kv:key list --namespace-id some-namespace-id");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            }
          ]"
        `);
      });

      it("should list the keys of a namespace specified by binding", async () => {
        writeWranglerConfig();
        const keys = ["key-1", "key-2", "key-3"];
        mockKeyListRequest("bound-id", keys);

        await runWrangler("kv:key list --binding someBinding");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            }
          ]"
        `);
      });

      it("should list the keys of a preview namespace specified by binding", async () => {
        writeWranglerConfig();
        const keys = ["key-1", "key-2", "key-3"];
        mockKeyListRequest("preview-bound-id", keys);
        await runWrangler("kv:key list --binding someBinding --preview");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            }
          ]"
        `);
      });

      it("should list the keys of a namespace specified by binding, in a given environment", async () => {
        writeWranglerConfig();
        const keys = ["key-1", "key-2", "key-3"];
        mockKeyListRequest("env-bound-id", keys);
        await runWrangler(
          "kv:key list --binding someBinding --env some-environment"
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            }
          ]"
        `);
      });

      it("should list the keys of a preview namespace specified by binding, in a given environment", async () => {
        writeWranglerConfig();
        const keys = ["key-1", "key-2", "key-3"];
        mockKeyListRequest("preview-env-bound-id", keys);
        await runWrangler(
          "kv:key list --binding someBinding --preview --env some-environment"
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration\\": 123456789,
              \\"metadata\\": {}
            }
          ]"
        `);
      });

      // We'll run the next test with variations on the cursor
      // that's returned on cloudflare's API after all results
      // have been drained.
      for (const blankCursorValue of [undefined, null, ""] as [
        undefined,
        null,
        ""
      ]) {
        describe(`cursor - ${blankCursorValue}`, () => {
          it("should make multiple requests for paginated results", async () => {
            // Create a lot of mock keys, so that the fetch requests will be paginated
            const keys: string[] = [];
            for (let i = 0; i < 550; i++) {
              keys.push("key-" + i);
            }
            // Ask for the keys in pages of size 100.
            const requests = mockKeyListRequest(
              "some-namespace-id",
              keys,
              100,
              blankCursorValue
            );
            await runWrangler(
              "kv:key list --namespace-id some-namespace-id --limit 100"
            );
            expect(std.err).toMatchInlineSnapshot(`""`);
            expect(JSON.parse(std.out).map((k) => k.name)).toEqual(keys);
            expect(requests.count).toEqual(6);
          });
        });
      }

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler("kv:key list --binding otherBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );
        expect(std.err).toMatchInlineSnapshot(`
          "A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

          [32m%s[0m
          If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
        expect(std.out).toMatchInlineSnapshot(`""`);
      });
    });

    describe("get", () => {
      afterEach(() => {
        unsetMockFetchKVGetValues();
      });

      it("should get a key in a given namespace specified by namespace-id", async () => {
        setMockFetchKVGetValue(
          "some-account-id",
          "some-namespace-id",
          "my-key",
          "my-value"
        );
        await runWrangler("kv:key get my-key --namespace-id some-namespace-id");
        expect(std.out).toMatchInlineSnapshot(`"my-value"`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should get a key in a given namespace specified by binding", async () => {
        writeWranglerConfig();
        setMockFetchKVGetValue(
          "some-account-id",
          "bound-id",
          "my-key",
          "my-value"
        );
        await runWrangler(
          "kv:key get my-key --binding someBinding --preview false"
        );
        expect(std.out).toMatchInlineSnapshot(`"my-value"`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should get a key in a given preview namespace specified by binding", async () => {
        writeWranglerConfig();
        setMockFetchKVGetValue(
          "some-account-id",
          "preview-bound-id",
          "my-key",
          "my-value"
        );
        await runWrangler("kv:key get my-key --binding someBinding --preview");
        expect(std.out).toMatchInlineSnapshot(`"my-value"`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should get a key for the specified environment in a given namespace", async () => {
        writeWranglerConfig();
        setMockFetchKVGetValue(
          "some-account-id",
          "env-bound-id",
          "my-key",
          "my-value"
        );
        await runWrangler(
          "kv:key get my-key my-value --binding someBinding --env some-environment --preview false"
        );
        expect(std.out).toMatchInlineSnapshot(`"my-value"`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should error if no key is provided", async () => {
        await expect(
          runWrangler("kv:key get")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Not enough non-option arguments: got 0, need at least 1"`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key get <key>

          Reads a single value by key from the given namespace.

          Positionals:
            key  The key value to get.  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]

          Not enough non-option arguments: got 0, need at least 1"
        `);
      });

      it("should error if no binding nor namespace is provided", async () => {
        await expect(
          runWrangler("kv:key get foo")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments binding and namespace-id is required"`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key get <key>

          Reads a single value by key from the given namespace.

          Positionals:
            key  The key value to get.  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]

          Exactly one of the arguments binding and namespace-id is required"
        `);
      });

      it("should error if both binding and namespace is provided", async () => {
        await expect(
          runWrangler("kv:key get foo --binding x --namespace-id y")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments binding and namespace-id are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key get <key>

          Reads a single value by key from the given namespace.

          Positionals:
            key  The key value to get.  [string] [required]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
            -l, --local         Run on my machine  [boolean] [default: false]
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
                --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]

          Arguments binding and namespace-id are mutually exclusive"
        `);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler("kv:key get key --binding otherBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );
        expect(std.out).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`
          "A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

          [32m%s[0m
          If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
      });
    });

    describe("delete", () => {
      function mockDeleteRequest(
        expectedNamespaceId: string,
        expectedKey: string
      ) {
        const requests = { count: 0 };
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
          "DELETE",
          ([_url, accountId, namespaceId, key]) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            expect(key).toEqual(expectedKey);
            return null;
          }
        );
        return requests;
      }

      it("should delete a key in a namespace specified by id", async () => {
        const requests = mockDeleteRequest("some-namespace-id", "someKey");
        await runWrangler(
          `kv:key delete --namespace-id some-namespace-id someKey`
        );
        expect(requests.count).toEqual(1);
      });

      it("should delete a key in a namespace specified by binding name", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("bound-id", "someKey");
        await runWrangler(
          `kv:key delete --binding someBinding --preview false someKey`
        );
        expect(requests.count).toEqual(1);
      });

      it("should delete a key in a preview namespace specified by binding name", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("preview-bound-id", "someKey");
        await runWrangler(
          `kv:key delete --binding someBinding --preview someKey`
        );
        expect(requests.count).toEqual(1);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler(`kv:key delete --binding otherBinding someKey`)
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );

        expect(std.err).toMatchInlineSnapshot(`
          "A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

          [32m%s[0m
          If you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new."
        `);
      });

      it("should delete a key in a namespace specified by binding name in a given environment", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("env-bound-id", "someKey");
        await runWrangler(
          `kv:key delete --binding someBinding --env some-environment --preview false someKey`
        );
        expect(std.out).toMatchInlineSnapshot(
          `"deleting the key \\"someKey\\" on namespace env-bound-id"`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should delete a key in a preview namespace specified by binding name in a given environment", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("preview-env-bound-id", "someKey");
        await runWrangler(
          `kv:key delete --binding someBinding --env some-environment --preview someKey`
        );
        expect(requests.count).toEqual(1);
      });
    });
  });
});

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
