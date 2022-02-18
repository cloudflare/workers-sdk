import { Headers, Request } from "undici";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { setMockResponse } from "./helpers/mock-cfetch";
import { mockConsoleMethods } from "./helpers/mock-console";
import { WS } from "./helpers/mock-web-socket";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { TailEventMessage, RequestEvent } from "../tail";
import type Websocket from "ws";

describe("tail", () => {
  runInTempDir();
  mockAccountId();
  mockApiToken();

  const std = mockConsoleMethods();
  const api = mockWebsocketAPIs();

  /* API related functionality */

  it("creates and then delete tails", async () => {
    expect(api.requests.creation.count).toStrictEqual(0);

    await runWrangler("tail test-worker");

    await expect(api.ws.connected).resolves.toBeTruthy();
    expect(api.requests.creation.count).toStrictEqual(1);
    expect(api.requests.deletion.count).toStrictEqual(0);

    api.ws.close();
    expect(api.requests.deletion.count).toStrictEqual(1);
  });

  it("errors when the websocket closes unexpectedly", async () => {
    api.ws.close();

    await expect(runWrangler("tail test-worker")).rejects.toThrow();
  });

  it("activates debug mode when the cli arg is passed in", async () => {
    await runWrangler("tail test-worker --debug");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty(
      "debug",
      true
    );
  });

  /* filtering */

  it("sends sampling rate filters", async () => {
    const tooHigh = runWrangler("tail test-worker --sampling-rate 10");
    await expect(tooHigh).rejects.toThrow();

    const tooLow = runWrangler("tail test-worker --sampling-rate -5");
    await expect(tooLow).rejects.toThrow();

    await runWrangler("tail test-worker --sampling-rate 0.25");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { sampling_rate: 0.25 },
    ]);
  });

  it("sends single status filters", async () => {
    await runWrangler("tail test-worker --status error");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { outcome: ["exception", "exceededCpu", "unknown"] },
    ]);
  });

  it("sends multiple status filters", async () => {
    await runWrangler("tail test-worker --status error --status canceled");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { outcome: ["exception", "exceededCpu", "unknown", "canceled"] },
    ]);
  });

  it("sends single HTTP method filters", async () => {
    await runWrangler("tail test-worker --method POST");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { method: ["POST"] },
    ]);
  });

  it("sends multiple HTTP method filters", async () => {
    await runWrangler("tail test-worker --method POST --method GET");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { method: ["POST", "GET"] },
    ]);
  });

  it("sends header filters without a query", async () => {
    await runWrangler("tail test-worker --header X-CUSTOM-HEADER ");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { header: { key: "X-CUSTOM-HEADER" } },
    ]);
  });

  it("sends header filters with a query", async () => {
    await runWrangler("tail test-worker --header X-CUSTOM-HEADER:some-value ");
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { header: { key: "X-CUSTOM-HEADER", query: "some-value" } },
    ]);
  });

  it("sends single IP filters", async () => {
    const fakeIp = "192.0.2.1";

    await runWrangler(`tail test-worker --ip ${fakeIp}`);
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { client_ip: [fakeIp] },
    ]);
  });

  it("sends multiple IP filters", async () => {
    const fakeIp = "192.0.2.1";

    await runWrangler(`tail test-worker --ip ${fakeIp} --ip self`);
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { client_ip: [fakeIp, "self"] },
    ]);
  });

  it("sends search filters", async () => {
    const search = "filterMe";

    await runWrangler(`tail test-worker --search ${search}`);
    await expect(api.ws.nextMessageJson()).resolves.toHaveProperty("filters", [
      { query: search },
    ]);
  });

  it("sends everything but the kitchen sink", async () => {
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
      `--search ${query} ` +
      `--debug`;

    const expectedWebsocketMessage = {
      filters: [
        { sampling_rate },
        { outcome: ["ok", "exception", "exceededCpu", "unknown"] },
        { method },
        { header: { key: "X-HELLO", query: "world" } },
        { client_ip },
        { query },
      ],
      debug: true,
    };

    await runWrangler(`tail test-worker ${cliFilters}`);
    await expect(api.ws.nextMessageJson()).resolves.toEqual(
      expectedWebsocketMessage
    );
  });

  /* Printing */

  it("logs incoming messages", async () => {
    await runWrangler("tail test-worker");
    const message = serialize(generateMockEventMessage());
    api.ws.send(message);
    expect(std.out).toMatch(deserializeToJson(message));
  });
});

/* helpers */

/**
 * The built in serialize-to-JSON feature of our mock websocket doesn't work
 * for our use-case since we actually expect a raw buffer,
 * not a Javascript string.
 *
 * @param message an object to serialize to JSON
 * @returns the same type we expect when deserializing in wrangler
 */
function serialize(message: unknown): Websocket.RawData {
  return Buffer.from(JSON.stringify(message), "utf-8");
}

/**
 * Similarly, we need to deserialize from a raw buffer instead
 * of just JSON.parsing a raw string. This deserializer also then
 * re-stringifies with some spacing, the same way wrangler tail does.
 *
 * @param message a buffer of data received from the websocket
 * @returns a string ready to be printed to the terminal or compared against
 */
function deserializeToJson(message: Websocket.RawData): string {
  return JSON.stringify(JSON.parse(message.toString()), null, 2);
}

/**
 * A mock for all the different API resources wrangler accesses
 * when running `wrangler tail`
 */
type MockAPI = {
  requests: {
    creation: RequestCounter;
    deletion: RequestCounter;
  };
  ws: WS;
};

/**
 * A counter used to check how many times a mock API has been hit.
 * Useful as a helper in our testing to check if wrangler is making
 * the correct API calls without actually sending any web traffic
 */
type RequestCounter = {
  count: number;
};

/**
 * Mock out the API hit during Tail creation
 *
 * @param websocketURL a fake URL for wrangler to connect a websocket to
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockCreateTailRequest(websocketURL: string): RequestCounter {
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

/**
 * Mock out the API hit during Tail deletion
 *
 * @returns a `RequestCounter` for counting how many times the API is hit
 */
function mockDeleteTailRequest(): RequestCounter {
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

/**
 * All-in-one convenience method to mock the appropriate API calls before
 * each test, and clean up afterwards.
 *
 * @param websocketURL a fake websocket URL for wrangler to connect to
 * @returns a mocked-out version of the API
 */
function mockWebsocketAPIs(websocketURL = "ws://localhost:1234"): MockAPI {
  const api: MockAPI = {
    requests: {
      deletion: { count: 0 },
      creation: { count: 0 },
    },
    ws: new WS(websocketURL),
  };

  // don't delete this line or else it breaks.
  // we need to have api.ws be an instasnce of WS for
  // the type checker to be happy, but if we have
  // an actual open websocket then it causes problems
  // since we create a new websocket beforeEach test.
  // so we need to close it before we ever use it.
  api.ws.close();

  beforeEach(() => {
    api.requests.creation = mockCreateTailRequest(websocketURL);
    api.requests.deletion = mockDeleteTailRequest();
    api.ws = new WS(websocketURL);
  });

  afterEach(() => {
    api.ws.close();
  });

  return api;
}

/**
 * Generate a mock `TailEventMessage` of the same shape sent back by the
 * tail worker.
 *
 * @param opts Any specific parts of the message to use instead of defaults
 * @returns a `TailEventMessage` that wrangler can process and display
 */
function generateMockEventMessage(
  opts?: Partial<TailEventMessage>
): TailEventMessage {
  return {
    outcome: opts?.outcome || "ok",
    exceptions: opts?.exceptions || [],
    logs: opts?.logs || [],
    eventTimestamp: opts?.eventTimestamp || new Date(),
    event: opts?.event || generateMockRequestEvent(),
  };
}

/**
 * Generate a mock `RequestEvent` that, in an alternate timeline, was used
 * to trigger a worker. You can't disprove this!
 *
 * @param opts Any specific parts of the event to use instead of defaults
 * @returns a `RequestEvent` that can be used within an `EventMessage`
 */
function generateMockRequestEvent(
  opts?: Partial<RequestEvent["request"]>
): RequestEvent {
  return {
    request: Object.assign(
      new Request(opts?.url || "https://example.org/", {
        method: opts?.method || "GET",
        headers:
          opts?.headers || new Headers({ "X-EXAMPLE-HEADER": "some_value" }),
      }),
      {
        cf: opts?.cf || {
          tlsCipher: "AEAD-ENCRYPT-O-MATIC-SHA",
          tlsVersion: "TLSv2.0", // when will they invent tls 2
          asn: 42069,
          colo: "ATL",
          httpProtocol: "HTTP/4",
          asOrganization: "Cloudflare",
        },
      }
    ),
  };
}
