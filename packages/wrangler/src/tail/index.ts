import WebSocket from "ws";
import { version as packageVersion } from "../../package.json";
import { fetchResult } from "../cfetch";
import { createTailButDontConnect, makeDeleteTailUrl } from "./api";
import { sendFilters } from "./filters";
import type { ApiFilter, ApiFilterMessage } from "./filters";

export type { TailCLIFilters } from "./filters";
export { translateCliFiltersToApiFilters } from "./filters";
export { jsonPrintLogs } from "./logging";

// if debug mode is enabled, then all logs will be sent through.
// logs that _would_ have been blocked will result with a message
// telling you what filter would have rejected it
export const DEBUG_MODE_ENABLED = false;

export type Tail = {
  ws: WebSocket;
  expiration: Date;
  deleteTail: () => Promise<void>;
  setFilters: (filters: ApiFilterMessage) => void;
};

/**
 * Abstracts away all the API calls and websocket connections necessary to
 * create a tail and attach wrangler to it.
 *
 * Behind the scenes, this function:
 * - Sends an API request to create a new tail
 * - Creates but doesn't send the API request for tail deletion
 *   - This request should be sent when we're done with the tail!
 * - Creates a websocket connection with the tail
 * - (Optionally) sends filters so that we only receive a subset of logs
 *
 * @param accountId the user's account ID
 * @param workerName the worker to tail
 * @param filters any filters
 * @returns your new `Tail`
 */
export async function createTail(
  accountId: string,
  workerName: string,
  filters: ApiFilter[]
): Promise<Tail> {
  const {
    id: tailId,
    url: websocketUrl,
    expires_at: expiration,
  } = await createTailButDontConnect(accountId, workerName);
  const deleteUrl = makeDeleteTailUrl(accountId, workerName, tailId);

  async function deleteTail() {
    await fetchResult(deleteUrl, { method: "DELETE" });
  }

  const ws = new WebSocket(websocketUrl, "trace-v1", {
    headers: {
      "Sec-WebSocket-Protocol": "trace-v1", // needs to be `trace-v1` to be accepted
      "User-Agent": `wrangler-js/${packageVersion}`,
    },
  });

  // check if there's any filters to send
  if (filters.length !== 0) {
    const message: ApiFilterMessage = {
      filters,
      debug: DEBUG_MODE_ENABLED,
    };

    ws.on("open", function () {
      sendFilters(ws, message);
    });
  }

  ws.on("close", async () => {
    ws.terminate();
    await deleteTail();
  });

  return {
    ws,
    expiration,
    deleteTail,
    setFilters: (message) => {
      sendFilters(ws, message);
    },
  };
}

export function prettyPrintLogs(_data: WebSocket.RawData): void {
  throw new Error("TODO!");
}
