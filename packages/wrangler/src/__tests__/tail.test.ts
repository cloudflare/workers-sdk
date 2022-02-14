import WS from "jest-websocket-mock";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse } from "./helpers/mock-cfetch";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("tail", () => {
  runInTempDir();
  mockAccountId();
  mockApiToken();

  it("should create and then delete tail workers", async () => {
    const websocketURL = "ws://localhost:1234";
    const server = new WS(websocketURL);
    mockCreateTailRequest(websocketURL);
    mockDeleteTailRequest();
    try {
      await runWrangler("tail test-worker");
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
        expires_at: new Date(3000, 0, 0),
      };
    }
  );
}

function mockDeleteTailRequest() {
  setMockResponse(
    "/accounts/:accountId/workers/scripts/:worker/tails/:tailId",
    "DELETE",
    () => {
      return null;
    }
  );
}
