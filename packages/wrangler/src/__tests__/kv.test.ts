import { writeFileSync } from "node:fs";
import { Headers } from "undici";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
  setMockResponse,
  unsetAllMocks,
  unsetMockFetchKVGetValues,
  setMockFetchKVGetValue,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearConfirmMocks, mockConfirm } from "./helpers/mock-dialogs";
import { mockKeyListRequest } from "./helpers/mock-kv";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { KeyValue, KVNamespaceInfo, NamespaceKeyInfo } from "../kv";

describe("wrangler", () => {
  mockAccountId();
  mockApiToken();
  runInTempDir();
  const std = mockConsoleMethods();

  afterEach(() => {
    unsetAllMocks();
    clearConfirmMocks();
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
        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
            -e, --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

          "
        `);
      });

      it("should error if the namespace to create contains spaces", async () => {
        await expect(
          runWrangler("kv:namespace create abc def ghi")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Unknown arguments: def, ghi"`
        );
        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
            -e, --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: def, ghi[0m

          "
        `);
      });

      it("should error if the namespace to create is not valid", async () => {
        await expect(
          runWrangler("kv:namespace create abc-def")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"The namespace binding name \\"abc-def\\" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number."`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
            -e, --env      Perform on a specific environment  [string]
                --preview  Interact with a preview namespace  [boolean]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mThe namespace binding name \\"abc-def\\" is invalid. It can only have alphanumeric and _ characters, and cannot begin with a number.[0m

          "
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
        writeFileSync("./wrangler.toml", 'name = "other-worker"', "utf-8");
        mockCreateRequest("other-worker-UnitTestNamespace");
        await runWrangler("kv:namespace create UnitTestNamespace");
        expect(std.out).toMatchInlineSnapshot(`
            "🌀 Creating namespace with title \\"other-worker-UnitTestNamespace\\"
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
                --binding       The name of the namespace to delete  [string]
                --namespace-id  The id of the namespace to delete  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot able to delete namespace.[0m

            A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".

          "
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
        expectedKV: KeyValue
      ) {
        const requests = { count: 0 };
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId/values/:key",
          "PUT",
          ([_url, accountId, namespaceId, key], { body }, query) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            expect(key).toEqual(expectedKV.key);
            expect(body).toEqual(expectedKV.value);
            if (expectedKV.expiration !== undefined) {
              expect(query.get("expiration")).toEqual(
                `${expectedKV.expiration}`
              );
            } else {
              expect(query.has("expiration")).toBe(false);
            }
            if (expectedKV.expiration_ttl) {
              expect(query.get("expiration_ttl")).toEqual(
                `${expectedKV.expiration_ttl}`
              );
            } else {
              expect(query.has("expiration_ttl")).toBe(false);
            }
            return null;
          }
        );
        return requests;
      }

      it("should put a key in a given namespace specified by namespace-id", async () => {
        const requests = mockKeyPutRequest("some-namespace-id", {
          key: "my-key",
          value: "my-value",
        });

        await runWrangler(
          "kv:key put my-key my-value --namespace-id some-namespace-id"
        );

        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should encode the key in the api request to put a value", async () => {
        const requests = mockKeyPutRequest("DS9", {
          key: "%2Fmy-key",
          value: "my-value",
        });

        await runWrangler("kv:key put /my-key my-value --namespace-id DS9");

        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"/my-key\\" on namespace DS9."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should put a key in a given namespace specified by binding", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest("bound-id", {
          key: "my-key",
          value: "my-value",
        });
        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --preview false"
        );

        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"my-key\\" on namespace bound-id."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should put a key in a given preview namespace specified by binding", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest("preview-bound-id", {
          key: "my-key",
          value: "my-value",
        });

        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --preview"
        );

        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"my-key\\" on namespace preview-bound-id."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should add expiration and ttl properties when putting a key", async () => {
        const requests = mockKeyPutRequest("some-namespace-id", {
          key: "my-key",
          value: "my-value",
          expiration: 10,
          expiration_ttl: 20,
        });
        await runWrangler(
          "kv:key put my-key my-value --namespace-id some-namespace-id --expiration 10 --ttl 20"
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"my-key\\" on namespace some-namespace-id."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should put a key to the specified environment in a given namespace", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest("env-bound-id", {
          key: "my-key",
          value: "my-value",
        });
        await runWrangler(
          "kv:key put my-key my-value --binding someBinding --env some-environment --preview false"
        );
        expect(std.out).toMatchInlineSnapshot(
          `"Writing the value \\"my-value\\" to key \\"my-key\\" on namespace env-bound-id."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(requests.count).toEqual(1);
      });

      it("should put a key with a value loaded from a given path", async () => {
        writeFileSync("foo.txt", "file-contents", "utf-8");
        const requests = mockKeyPutRequest("some-namespace-id", {
          key: "my-key",
          value: "file-contents",
        });
        await runWrangler(
          "kv:key put my-key --namespace-id some-namespace-id --path foo.txt"
        );
        expect(std.out).toMatchInlineSnapshot(
          `"Writing the contents of foo.txt to the key \\"my-key\\" on namespace some-namespace-id."`
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

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to  [string] [required]
            value  The value to write  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
                --binding       The binding of the namespace to write to  [string]
                --namespace-id  The id of the namespace to write to  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path  [string]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

          "
        `);
      });

      it("should error if no binding nor namespace is provided", async () => {
        await expect(
          runWrangler("kv:key put foo bar")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments binding and namespace-id is required"`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to  [string] [required]
            value  The value to write  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
                --binding       The binding of the namespace to write to  [string]
                --namespace-id  The id of the namespace to write to  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path  [string]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments binding and namespace-id is required[0m

          "
        `);
      });

      it("should error if both binding and namespace is provided", async () => {
        await expect(
          runWrangler("kv:key put foo bar --binding x --namespace-id y")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments binding and namespace-id are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to  [string] [required]
            value  The value to write  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
                --binding       The binding of the namespace to write to  [string]
                --namespace-id  The id of the namespace to write to  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path  [string]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments binding and namespace-id are mutually exclusive[0m

          "
        `);
      });

      it("should error if no value nor path is provided", async () => {
        await expect(
          runWrangler("kv:key put key --namespace-id 12345")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments value and path is required"`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to  [string] [required]
            value  The value to write  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
                --binding       The binding of the namespace to write to  [string]
                --namespace-id  The id of the namespace to write to  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path  [string]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments value and path is required[0m

          "
        `);
      });

      it("should error if both value and path is provided", async () => {
        await expect(
          runWrangler("kv:key put key value --path xyz --namespace-id 12345")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments value and path are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "wrangler kv:key put <key> [value]

          Writes a single key/value pair to the given namespace.

          Positionals:
            key    The key to write to  [string] [required]
            value  The value to write  [string]

          Flags:
            -c, --config   Path to .toml configuration file  [string]
            -h, --help     Show help  [boolean]
            -v, --version  Show version number  [boolean]

          Options:
                --binding       The binding of the namespace to write to  [string]
                --namespace-id  The id of the namespace to write to  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean]
                --ttl           Time for which the entries should be visible  [number]
                --expiration    Time since the UNIX epoch after which the entry expires  [number]
                --path          Read value from the file at a given path  [string]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments value and path are mutually exclusive[0m

          "
        `);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler("kv:key put key value --binding otherBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

          "
        `);
      });

      it("should error if a given binding has both preview and non-preview and --preview is not specified", async () => {
        writeWranglerConfig();
        const requests = mockKeyPutRequest("preview-bound-id", {
          key: "my-key",
          value: "my-value",
        });
        await expect(
          runWrangler("kv:key put my-key my-value --binding someBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"someBinding has both a namespace ID and a preview ID. Specify \\"--preview\\" or \\"--preview false\\" to avoid writing data to the wrong namespace."`
        );
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1msomeBinding has both a namespace ID and a preview ID. Specify \\"--preview\\" or \\"--preview false\\" to avoid writing data to the wrong namespace.[0m

          "
        `);
        expect(requests.count).toEqual(0);
      });
    });

    describe("list", () => {
      it("should list the keys of a namespace specified by namespace-id", async () => {
        const keys = [
          { name: "key-1" },
          { name: "key-2", expiration: 123456789 },
          { name: "key-3", expiration_ttl: 666 },
        ];
        mockKeyListRequest("some-namespace-id", keys);
        await runWrangler("kv:key list --namespace-id some-namespace-id");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\"
            },
            {
              \\"name\\": \\"key-2\\",
              \\"expiration\\": 123456789
            },
            {
              \\"name\\": \\"key-3\\",
              \\"expiration_ttl\\": 666
            }
          ]"
        `);
      });

      it("should list the keys of a namespace specified by binding", async () => {
        writeWranglerConfig();
        const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
        mockKeyListRequest("bound-id", keys);

        await runWrangler("kv:key list --binding someBinding");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\"
            },
            {
              \\"name\\": \\"key-2\\"
            },
            {
              \\"name\\": \\"key-3\\"
            }
          ]"
        `);
      });

      it("should list the keys of a preview namespace specified by binding", async () => {
        writeWranglerConfig();
        const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
        mockKeyListRequest("preview-bound-id", keys);
        await runWrangler("kv:key list --binding someBinding --preview");
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\"
            },
            {
              \\"name\\": \\"key-2\\"
            },
            {
              \\"name\\": \\"key-3\\"
            }
          ]"
        `);
      });

      it("should list the keys of a namespace specified by binding, in a given environment", async () => {
        writeWranglerConfig();
        const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
        mockKeyListRequest("env-bound-id", keys);
        await runWrangler(
          "kv:key list --binding someBinding --env some-environment"
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\"
            },
            {
              \\"name\\": \\"key-2\\"
            },
            {
              \\"name\\": \\"key-3\\"
            }
          ]"
        `);
      });

      it("should list the keys of a preview namespace specified by binding, in a given environment", async () => {
        writeWranglerConfig();
        const keys = [{ name: "key-1" }, { name: "key-2" }, { name: "key-3" }];
        mockKeyListRequest("preview-env-bound-id", keys);
        await runWrangler(
          "kv:key list --binding someBinding --preview --env some-environment"
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
        expect(std.out).toMatchInlineSnapshot(`
          "[
            {
              \\"name\\": \\"key-1\\"
            },
            {
              \\"name\\": \\"key-2\\"
            },
            {
              \\"name\\": \\"key-3\\"
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
            const keys: NamespaceKeyInfo[] = [];
            for (let i = 0; i < 550; i++) {
              keys.push({ name: "key-" + i });
            }
            // Ask for the keys in pages of size 100.
            const requests = mockKeyListRequest(
              "some-namespace-id",
              keys,
              100,
              blankCursorValue
            );
            await runWrangler("kv:key list --namespace-id some-namespace-id");
            expect(std.err).toMatchInlineSnapshot(`""`);
            expect(JSON.parse(std.out)).toEqual(keys);
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
          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

          "
        `);
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
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
          "kv:key get my-key --binding someBinding --env some-environment --preview false"
        );
        expect(std.out).toMatchInlineSnapshot(`"my-value"`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should encode the key in the api request to get a value", async () => {
        setMockFetchKVGetValue(
          "some-account-id",
          "some-namespace-id",
          "%2Fmy%2Ckey",
          "my-value"
        );
        await runWrangler(
          "kv:key get /my,key --namespace-id some-namespace-id"
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
        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mNot enough non-option arguments: got 0, need at least 1[0m

          "
        `);
      });

      it("should error if no binding nor namespace is provided", async () => {
        await expect(
          runWrangler("kv:key get foo")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Exactly one of the arguments binding and namespace-id is required"`
        );
        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mExactly one of the arguments binding and namespace-id is required[0m

          "
        `);
      });

      it("should error if both binding and namespace is provided", async () => {
        await expect(
          runWrangler("kv:key get foo --binding x --namespace-id y")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Arguments binding and namespace-id are mutually exclusive"`
        );

        expect(std.out).toMatchInlineSnapshot(`
          "
          "
        `);
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
                --binding       The name of the namespace to get from  [string]
                --namespace-id  The id of the namespace to get from  [string]
            -e, --env           Perform on a specific environment  [string]
                --preview       Interact with a preview namespace  [boolean] [default: false]
          [31mX [41;31m[[41;97mERROR[41;31m][0m [1mArguments binding and namespace-id are mutually exclusive[0m

          "
        `);
      });

      it("should error if a given binding name is not in the configured kv namespaces", async () => {
        writeWranglerConfig();
        await expect(
          runWrangler("kv:key get key --binding otherBinding")
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"A namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\"."`
        );
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.err).toMatchInlineSnapshot(`
          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

          "
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

      it("should encode the key in the api request to delete a value", async () => {
        const requests = mockDeleteRequest("voyager", "%2FNCC-74656");
        await runWrangler(`kv:key delete --namespace-id voyager /NCC-74656`);
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(
          `"Deleting the key \\"/NCC-74656\\" on namespace voyager."`
        );
        expect(std.err).toMatchInlineSnapshot(`""`);
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
          "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mA namespace with binding name \\"otherBinding\\" was not found in the configured \\"kv_namespaces\\".[0m

          "
        `);
      });

      it("should delete a key in a namespace specified by binding name in a given environment", async () => {
        writeWranglerConfig();
        const requests = mockDeleteRequest("env-bound-id", "someKey");
        await runWrangler(
          `kv:key delete --binding someBinding --env some-environment --preview false someKey`
        );
        expect(std.out).toMatchInlineSnapshot(
          `"Deleting the key \\"someKey\\" on namespace env-bound-id."`
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

  describe("kv:bulk", () => {
    describe("put", () => {
      function mockPutRequest(
        expectedNamespaceId: string,
        expectedKeyValues: KeyValue[]
      ) {
        const requests = { count: 0 };
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
          "PUT",
          ([_url, accountId, namespaceId], { body }) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            expect(JSON.parse(body as string)).toEqual(
              expectedKeyValues.slice(
                (requests.count - 1) * 5000,
                requests.count * 5000
              )
            );
            return null;
          }
        );
        return requests;
      }

      it("should put the key-values parsed from a file", async () => {
        const keyValues: KeyValue[] = [
          { key: "someKey1", value: "someValue1" },
          { key: "ns:someKey2", value: "123", base64: true },
          { key: "someKey3", value: "someValue3", expiration: 100 },
          { key: "someKey4", value: "someValue4", expiration_ttl: 500 },
        ];
        writeFileSync("./keys.json", JSON.stringify(keyValues));
        const requests = mockPutRequest("some-namespace-id", keyValues);
        await runWrangler(
          `kv:bulk put --namespace-id some-namespace-id keys.json`
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(`"Success!"`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should put the key-values in batches of 5000 parsed from a file", async () => {
        const keyValues: KeyValue[] = new Array(12000).fill({
          key: "someKey1",
          value: "someValue1",
        });
        writeFileSync("./keys.json", JSON.stringify(keyValues));
        const requests = mockPutRequest("some-namespace-id", keyValues);
        await runWrangler(
          `kv:bulk put --namespace-id some-namespace-id keys.json`
        );
        expect(requests.count).toEqual(3);
        expect(std.out).toMatchInlineSnapshot(`
          "Uploaded 0 of 12000.
          Uploaded 5000 of 12000.
          Uploaded 10000 of 12000.
          Uploaded 12000 of 12000.
          Success!"
        `);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should error if the file is not a JSON array", async () => {
        const keyValues = { key: "someKey1", value: "someValue1" };
        writeFileSync("./keys.json", JSON.stringify(keyValues));
        await expect(
          runWrangler(`kv:bulk put --namespace-id some-namespace-id keys.json`)
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
                "Unexpected JSON input from \\"keys.json\\".
                Expected an array of key-value objects but got type \\"object\\"."
              `);
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });

      it("should error if the array contains items that are not key-value objects", async () => {
        const keyValues = [
          123,
          "a string",
          { key: "someKey" },
          { value: "someValue" },
          { key: "someKey1", value: "someValue1", invalid: true },
        ];
        writeFileSync("./keys.json", JSON.stringify(keyValues));
        await expect(
          runWrangler(`kv:bulk put --namespace-id some-namespace-id keys.json`)
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
                "Unexpected JSON input from \\"keys.json\\".
                Each item in the array should be an object that matches:

                interface KeyValue {
                  key: string;
                  value: string;
                  expiration?: number;
                  expiration_ttl?: number;
                  metadata?: object;
                  base64?: boolean;
                }

                The item at index 0 is type: \\"number\\" - 123
                The item at index 1 is type: \\"string\\" - \\"a string\\"
                The item at index 2 is {\\"key\\":\\"someKey\\"}
                The item at index 3 is {\\"value\\":\\"someValue\\"}"
              `);

        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.warn).toMatchInlineSnapshot(`
          "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnexpected key-value properties in \\"keys.json\\".[0m

            The item at index 4 contains unexpected properties: [\\"invalid\\"].

          "
        `);
      });
    });

    describe("delete", () => {
      function mockDeleteRequest(
        expectedNamespaceId: string,
        expectedKeys: string[]
      ) {
        const requests = { count: 0 };
        setMockResponse(
          "/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
          "DELETE",
          ([_url, accountId, namespaceId], { headers, body }) => {
            requests.count++;
            expect(accountId).toEqual("some-account-id");
            expect(namespaceId).toEqual(expectedNamespaceId);
            expect(new Headers(headers ?? []).get("Content-Type")).toEqual(
              "application/json"
            );
            expect(JSON.parse(body as string)).toEqual(
              expectedKeys.slice(
                (requests.count - 1) * 5000,
                requests.count * 5000
              )
            );
            return null;
          }
        );
        return requests;
      }

      it("should delete the keys parsed from a file", async () => {
        const keys = ["someKey1", "ns:someKey2"];
        writeFileSync("./keys.json", JSON.stringify(keys));
        mockConfirm({
          text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
          result: true,
        });
        const requests = mockDeleteRequest("some-namespace-id", keys);
        await runWrangler(
          `kv:bulk delete --namespace-id some-namespace-id keys.json`
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(`"Success!"`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should delete the keys in batches of 5000 parsed from a file", async () => {
        const keys = new Array(12000).fill("some-key");
        writeFileSync("./keys.json", JSON.stringify(keys));
        mockConfirm({
          text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
          result: true,
        });
        const requests = mockDeleteRequest("some-namespace-id", keys);
        await runWrangler(
          `kv:bulk delete --namespace-id some-namespace-id keys.json`
        );
        expect(requests.count).toEqual(3);
        expect(std.out).toMatchInlineSnapshot(`
          "Deleted 0 of 12000.
          Deleted 5000 of 12000.
          Deleted 10000 of 12000.
          Deleted 12000 of 12000.
          Success!"
        `);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should not delete the keys if the user confirms no", async () => {
        const keys = ["someKey1", "ns:someKey2"];
        writeFileSync("./keys.json", JSON.stringify(keys));
        mockConfirm({
          text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
          result: false,
        });
        await runWrangler(
          `kv:bulk delete --namespace-id some-namespace-id keys.json`
        );
        expect(std.out).toMatchInlineSnapshot(
          `"Not deleting keys read from \\"keys.json\\"."`
        );
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should delete the keys without asking if --force is provided", async () => {
        const keys = ["someKey1", "ns:someKey2"];
        writeFileSync("./keys.json", JSON.stringify(keys));
        const requests = mockDeleteRequest("some-namespace-id", keys);
        await runWrangler(
          `kv:bulk delete --namespace-id some-namespace-id keys.json --force`
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(`"Success!"`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should delete the keys without asking if -f is provided", async () => {
        const keys = ["someKey1", "ns:someKey2"];
        writeFileSync("./keys.json", JSON.stringify(keys));
        const requests = mockDeleteRequest("some-namespace-id", keys);
        await runWrangler(
          `kv:bulk delete --namespace-id some-namespace-id keys.json -f`
        );
        expect(requests.count).toEqual(1);
        expect(std.out).toMatchInlineSnapshot(`"Success!"`);
        expect(std.warn).toMatchInlineSnapshot(`""`);
        expect(std.err).toMatchInlineSnapshot(`""`);
      });

      it("should error if the file is not a JSON array", async () => {
        const keys = 12354;
        writeFileSync("./keys.json", JSON.stringify(keys));
        mockConfirm({
          text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
          result: true,
        });
        await expect(
          runWrangler(
            `kv:bulk delete --namespace-id some-namespace-id keys.json`
          )
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
                "Unexpected JSON input from \\"keys.json\\".
                Expected an array of strings but got:
                12354"
              `);
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });

      it("should error if the file contains non-string items", async () => {
        const keys = ["good", 12354, { key: "someKey" }, null];
        writeFileSync("./keys.json", JSON.stringify(keys));
        mockConfirm({
          text: `Are you sure you want to delete all the keys read from "keys.json" from kv-namespace with id "some-namespace-id"?`,
          result: true,
        });
        await expect(
          runWrangler(
            `kv:bulk delete --namespace-id some-namespace-id keys.json`
          )
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
                "Unexpected JSON input from \\"keys.json\\".
                Expected an array of strings.
                The item at index 1 is type: \\"number\\" - 12354
                The item at index 2 is type: \\"object\\" - {\\"key\\":\\"someKey\\"}
                The item at index 3 is type: \\"object\\" - null"
              `);
        expect(std.out).toMatchInlineSnapshot(`
          "
          [32mIf you think this is a bug then please create an issue at https://github.com/cloudflare/wrangler2/issues/new.[0m"
        `);
        expect(std.warn).toMatchInlineSnapshot(`""`);
      });
    });
  });
});

function writeWranglerConfig() {
  writeFileSync(
    "./wrangler.toml",
    [
      'name = "other-worker"',
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
