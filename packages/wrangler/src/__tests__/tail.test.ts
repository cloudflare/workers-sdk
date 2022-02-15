import WS from "jest-websocket-mock";
import { Client } from "mock-socket";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type Websocket from "ws";

function serialize(message: unknown): Websocket.RawData {
  return Buffer.from(JSON.stringify(message), "utf-8");
}

function deserializeToJson(message: Websocket.RawData): string {
  return JSON.stringify(JSON.parse(message.toString()), null, 2);
}

describe("tail", () => {
  runInTempDir();
  mockAccountId();
  mockApiToken();

  // clean up any outstanding connections
  afterEach(() => WS.clean());

  const std = mockConsoleMethods();

  /* API related functionality */

  it("should create and then delete tails", async () => {
    const websocketURL = "ws://localhost:1234";
    const server = new WS(websocketURL);
    mockCreateTailRequest(websocketURL);
    const deletionRequests = mockDeleteTailRequest();

    try {
      await runWrangler("tail test-worker");
      expect(deletionRequests.count).toStrictEqual(0);
      await expect(server.connected).resolves.toBeTruthy();
    } finally {
      server.close();
      expect(deletionRequests.count).toStrictEqual(1);
    }
  });

  it("should send filters after connecting", async () => {
    const websocketUrl = "ws://localhost:1234";
    const server = new WS(websocketUrl);
    mockCreateTailRequest(websocketUrl);
    mockDeleteTailRequest();

    try {
      await runWrangler("tail test-worker --method POST");
    } finally {
      server.close();
    }
  });

  /* Basic logging */

  it("should log incoming messages", async () => {
    const websocketURL = "ws://localhost:1234";
    const server = new WS(websocketURL);
    mockCreateTailRequest(websocketURL);
    mockDeleteTailRequest();
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
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:worker/tails",
    "POST",
    () => {
      return {
        id: "tail-id",
        url: websocketURL,
        expires_at: new Date(3005, 0, 0),
      };
    }
  );
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
