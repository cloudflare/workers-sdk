import { randomUUID } from "crypto";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import {
  setMockResponse,
  unsetAllMocks,
} from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

// Asserting within mock responses get swallowed, so run them out-of-band
const outOfBandTests: (() => void)[] = [];
function assertLater(fn: () => void) {
  outOfBandTests.push(fn);
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

  it("should should display a list of available subcommands, for dispatch-namespace with no subcommand", async () => {
    await runWrangler("dispatch-namespace");
    await endEventLoop();

    expect(std.out).toMatchInlineSnapshot(`
      "wrangler dispatch-namespace

      Commands:
        wrangler dispatch-namespace create <namespace-name>  Creates a dispatch namespace
        wrangler dispatch-namespace delete <namespace-name>  Deletes a dispatch namespace

      Flags:
        -c, --config   Path to .toml configuration file  [string]
        -h, --help     Show help  [boolean]
        -v, --version  Show version number  [boolean]"
    `);
  });

  describe("create namespace", () => {
    mockAccountId();
    mockApiToken();

    afterEach(() => {
      unsetAllMocks();
    });

    function mockCreateRequest(expectedName: string) {
      const requests = { count: 0, lastUUID: "" };
      setMockResponse(
        "/accounts/:accountId/workers/dispatch/namespaces",
        ([_url], init) => {
          requests.count += 1;

          const incomingText = init.body?.toString() || "";
          const { name: namespace_name } = JSON.parse(incomingText);

          assertLater(() => {
            expect(init.method).toBe("POST");
            expect(incomingText).toBeDefined();
            expect(namespace_name).toEqual(expectedName);
          });

          const newUUID = randomUUID().replaceAll("-", "");
          requests.lastUUID = newUUID;
          return {
            namespace_name,
            namespace_id: newUUID,
          };
        }
      );
      return requests;
    }

    it("should display help for create", async () => {
      await expect(
        runWrangler("dispatch-namespace create")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Not enough non-option arguments: got 0, need at least 1"`
      );
      await endEventLoop();

      expect(std.out).toMatchInlineSnapshot(`
        "
        wrangler dispatch-namespace create <namespace-name>

        Creates a dispatch namespace

        Positionals:
          namespace-name  Name of the namespace to create  [string] [required]

        Flags:
          -c, --config   Path to .toml configuration file  [string]
          -h, --help     Show help  [boolean]
          -v, --version  Show version number  [boolean]"
      `);
    });

    it("should attempt to create the given namespace", async () => {
      const namespaceName = "my-namespace";
      const requests = mockCreateRequest(namespaceName);
      await runWrangler(`dispatch-namespace create ${namespaceName}`);
      await endEventLoop();
      expect(requests.count).toEqual(1);
      const newUUID = requests.lastUUID;

      expect(std.out).toMatchInlineSnapshot(
        `"Created namespace my-namespace with ID ${newUUID}"`
      );
    });
  });

  describe("delete namespace", () => {
    mockAccountId();
    mockApiToken();

    afterEach(() => {
      unsetAllMocks();
    });

    function mockDeleteRequest(expectedName: string) {
      const requests = { count: 0 };
      setMockResponse(
        "/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
        ([_url, _, namespaceName], init) => {
          requests.count += 1;

          assertLater(() => {
            expect(init.method).toBe("DELETE");
            expect(namespaceName).toEqual(expectedName);
          });

          return {};
        }
      );
      return requests;
    }

    it("should display help for delete", async () => {
      await expect(
        runWrangler("dispatch-namespace create")
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Not enough non-option arguments: got 0, need at least 1"`
      );
      await endEventLoop();

      expect(std.out).toMatchInlineSnapshot(`
        "
        wrangler dispatch-namespace create <namespace-name>

        Creates a dispatch namespace

        Positionals:
          namespace-name  Name of the namespace to create  [string] [required]

        Flags:
          -c, --config   Path to .toml configuration file  [string]
          -h, --help     Show help  [boolean]
          -v, --version  Show version number  [boolean]"
      `);
    });

    it("should try to delete the given namespace", async () => {
      const namespaceName = "my-namespace";
      const requests = mockDeleteRequest(namespaceName);
      await runWrangler(`dispatch-namespace delete ${namespaceName}`);
      await endEventLoop();
      expect(requests.count).toBe(1);

      expect(std.out).toMatchInlineSnapshot(
        `"Deleted namespace my-namespace."`
      );
    });
  });
});
