import WebSocket from "ws";
import cfetch from "./cfetch";
import { version as packageVersion } from "../package.json";

export type TailApiResponse = {
  id: string;
  url: string;
  expires_at: Date;
};

function makeCreateTailUrl(accountId: string, workerName: string): string {
  return `/accounts/${accountId}/workers/scripts/${workerName}/tails`;
}

function makeDeleteTailUrl(
  accountId: string,
  workerName: string,
  tailId: string
): string {
  return `/accounts/${accountId}/workers/scripts/${workerName}/tails/${tailId}`;
}

/// Creates a tail, but doesn't connect to it.
async function createTailButDontConnect(
  accountId: string,
  workerName: string
): Promise<TailApiResponse> {
  const createTailUrl = makeCreateTailUrl(accountId, workerName);
  /// https://api.cloudflare.com/#worker-tail-logs-start-tail
  return await cfetch<TailApiResponse>(createTailUrl, { method: "POST" });
}

export async function createTail(
  accountId: string,
  workerName: string,
  _filters: Filters
): Promise<{
  tail: WebSocket;
  expiration: Date;
  deleteTail: () => Promise<void>;
}> {
  const {
    id: tailId,
    url: websocketUrl,
    expires_at: expiration,
  } = await createTailButDontConnect(accountId, workerName);
  const deleteUrl = makeDeleteTailUrl(accountId, workerName, tailId);

  // deletes the tail
  async function deleteTail() {
    await cfetch(deleteUrl, { method: "DELETE" });
  }

  const tail = new WebSocket(websocketUrl, "trace-v1", {
    headers: {
      "Sec-WebSocket-Protocol": "trace-v1", // needs to be `trace-v1` to be accepted
      "User-Agent": `wrangler-js/${packageVersion}`,
    },
  });

  // TODO: send filters as well
  return { tail, expiration, deleteTail };
}

export type Filters = {
  status?: "ok" | "error" | "canceled";
  header?: string;
  method?: string;
  "sampling-rate"?: number;
  search?: string;
};
