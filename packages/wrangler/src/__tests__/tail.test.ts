import WS from "jest-websocket-mock";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type Websocket from "ws";

// change this if you're testing using debug mode
// (sends all logs regardless of filters)
const DEBUG = false;

function serialize(message: unknown): Websocket.RawData {
  return Buffer.from(JSON.stringify(message), "utf-8");
}

function deserializeToJson(message: Websocket.RawData): string {
  return JSON.stringify(JSON.parse(message.toString()), null, 2);
}

// This function should be called at the start of each test.
// You don't have to use anything it returns, but if we don't
// mock out these endpoints then the test just hangs.
// Since we do need to access the properties returned by this
// function, we can't stick it in a beforeEach (i don't think)
function setupWebsocketMocks(websocketURL = "ws://localhost:1234") {
  const server = new WS(websocketURL);
  const tailCreationRequests = mockCreateTailRequest(websocketURL);
  const tailDeletionRequests = mockDeleteTailRequest();

  return { server, tailCreationRequests, tailDeletionRequests };
}

describe("tail", () => {
  runInTempDir();
  mockAccountId();
  mockApiToken();

  // clean up any outstanding connections
  afterEach(() => WS.clean());

  const std = mockConsoleMethods();

  /* API related functionality */

  it("creates and then delete tails", async () => {
    const { server, tailCreationRequests, tailDeletionRequests } =
      setupWebsocketMocks();

    try {
      expect(tailCreationRequests.count).toStrictEqual(0);

      await runWrangler("tail test-worker");

      await expect(server.connected).resolves.toBeTruthy();
      expect(tailCreationRequests.count).toStrictEqual(1);
      expect(tailDeletionRequests.count).toStrictEqual(0);
    } finally {
      server.close();
      expect(tailDeletionRequests.count).toStrictEqual(1);
    }
  });

  /* filtering */

  it("sends sampling rate filters", async () => {
    const { server } = setupWebsocketMocks();

    const tooHigh = runWrangler("tail test-worker --sampling-rate 10");
    await expect(tooHigh).rejects.toThrow();

    const tooLow = runWrangler("tail test-worker --sampling-rate -5");
    await expect(tooLow).rejects.toThrow();

    try {
      await runWrangler("tail test-worker --sampling-rate 0.25");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ sampling_rate: 0.25 }]
      );
    } finally {
      server.close();
    }
  });

  it("sends single status filters", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker --status error");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ outcome: ["exception", "exceededCpu", "unknown"] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends multiple status filters", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker --status error --status canceled");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ outcome: ["exception", "exceededCpu", "unknown", "canceled"] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends single HTTP method filters", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker --method POST");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ method: ["POST"] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends multiple HTTP method filters", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker --method POST --method GET");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ method: ["POST", "GET"] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends header filters without a query", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker --header X-CUSTOM-HEADER ");
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ header: { key: "X-CUSTOM-HEADER" } }]
      );
    } finally {
      server.close();
    }
  });

  it("sends header filters with a query", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler(
        "tail test-worker --header X-CUSTOM-HEADER:some-value "
      );
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ header: { key: "X-CUSTOM-HEADER", query: "some-value" } }]
      );
    } finally {
      server.close();
    }
  });

  it("sends single IP filters", async () => {
    const { server } = setupWebsocketMocks();
    const fakeIp = "192.0.2.1";

    try {
      await runWrangler(`tail test-worker --ip ${fakeIp}`);
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ client_ip: [fakeIp] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends multiple IP filters", async () => {
    const { server } = setupWebsocketMocks();
    const fakeIp = "192.0.2.1";

    try {
      await runWrangler(`tail test-worker --ip ${fakeIp} --ip self`);
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ client_ip: [fakeIp, "self"] }]
      );
    } finally {
      server.close();
    }
  });

  it("sends search filters", async () => {
    const { server } = setupWebsocketMocks();
    const search = "filterMe";

    try {
      await runWrangler(`tail test-worker --search ${search}`);
      await expect(server.nextMessage.then(JSON.parse)).resolves.toHaveProperty(
        "filters",
        [{ query: search }]
      );
    } finally {
      server.close();
    }
  });

  it("sends everything but the kitchen sink", async () => {
    const { server } = setupWebsocketMocks();

    const sampling_rate = 0.69;
    const status = ["ok", "error"];
    const method = ["GET", "POST", "PUT"];
    const header = "X-HELLO:world";
    const client_ip = ["192.0.2.1", "self"];
    const query = "onlyTheseMessagesPlease";

    const cliFilters =
      `--sampling-rate ${sampling_rate} ` +
      status.map((s) => `--status ${s} `).join("") +
      method.map((m) => `--method ${m} `).join("") +
      `--header ${header} ` +
      client_ip.map((c) => `--ip ${c} `).join("") +
      `--search ${query}`;

    const expectedWebsocketMessage = {
      filters: [
        { sampling_rate: sampling_rate },
        { outcome: ["ok", "exception", "exceededCpu", "unknown"] },
        { method },
        { header: { key: "X-HELLO", query: "world" } },
        { client_ip },
        { query },
      ],
      debug: DEBUG,
    };

    try {
      await runWrangler(`tail test-worker ${cliFilters}`);
      await expect(server.nextMessage.then(JSON.parse)).resolves.toEqual(
        expectedWebsocketMessage
      );
    } finally {
      server.close();
    }
  });

  /* Basic logging */

  it("logs incoming messages", async () => {
    const { server } = setupWebsocketMocks();

    try {
      await runWrangler("tail test-worker");
      const greeting = serialize({ hello: "world!" });
      server.send(greeting);
      expect(std.out).toMatch(deserializeToJson(greeting));
    } finally {
      server.close();
    }
  });
});

function mockCreateTailRequest(websocketURL: string) {
  const requests = { count: 0 };
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:worker/tails",
    "POST",
    () => {
      requests.count++;
      return {
        id: "tail-id",
        url: websocketURL,
        expires_at: new Date(3005, 0, 0),
      };
    }
  );

  return requests;
}

function mockDeleteTailRequest() {
  const requests = { count: 0 };
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:worker/tails/:tailId",
    "DELETE",
    () => {
      requests.count++;
      return null;
    }
  );

  return requests;
}
