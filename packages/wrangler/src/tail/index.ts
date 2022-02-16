import WebSocket from "ws";
import { version as packageVersion } from "../../package.json";
import { fetchResult } from "../cfetch";
import type { ApiFilterMessage } from "./filters";
export type { CliFilters } from "./filters";
export { translateCliCommandToApiFilterMessage } from "./filters";

type TailCreationApiResponse = {
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

export async function createTail(
  accountId: string,
  workerName: string,
  message: ApiFilterMessage
): Promise<{
  tail: WebSocket;
  expiration: Date;
  deleteTail: () => Promise<void>;
}> {
  // https://api.cloudflare.com/#worker-tail-logs-start-tail
  const createTailUrl = makeCreateTailUrl(accountId, workerName);
  const {
    id: tailId,
    url: websocketUrl,
    expires_at: expiration,
  } = await fetchResult<TailCreationApiResponse>(createTailUrl, {
    method: "POST",
  });
  const deleteUrl = makeDeleteTailUrl(accountId, workerName, tailId);

  // deletes the tail
  async function deleteTail() {
    await fetchResult(deleteUrl, { method: "DELETE" });
  }

  const tail = new WebSocket(websocketUrl, "trace-v1", {
    headers: {
      "Sec-WebSocket-Protocol": "trace-v1", // needs to be `trace-v1` to be accepted
      "User-Agent": `wrangler-js/${packageVersion}`,
    },
  });

  tail.on("open", function () {
    tail.send(
      JSON.stringify(message),
      { binary: false, compress: false, mask: false, fin: true },
      (err) => {
        if (err) {
          throw err;
        }
      }
    );
  });

  return { tail, expiration, deleteTail };
}

export function prettyPrintLogs(_data: WebSocket.RawData): void {
  throw new Error("TODO!");
}

export function jsonPrintLogs(data: WebSocket.RawData): void {
  console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
}
