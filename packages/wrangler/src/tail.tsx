import WebSocket from "ws";
import cfetch from "./fetchwithauthandloginifrequired";
import { version as packageVersion } from "../package.json";

export type TailApiResponse = {
  id: string;
  url: string;
  expires_at: Date;
};

function makeCreateTailUrl(accountId: string, workerName: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/tails`;
}

function makeDeleteTailUrl(
  accountId: string,
  workerName: string,
  tailId: string
): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/tails/${tailId}`;
}

/// Creates a tail, but doesn't connect to it.
async function createTailButDontConnect(
  accountId: string,
  workerName: string
): Promise<TailApiResponse> {
  const createTailUrl = makeCreateTailUrl(accountId, workerName);
  /// https://api.cloudflare.com/#worker-tail-logs-start-tail
  const response = await cfetch(createTailUrl, { method: "POST" });
  if (!response.ok) {
    // - tail API can return 3 errors according to the docs:
    //   - 10057: too much traffic to add a tail
    //   - 10059: too many active tails, max is 10
    //   - 10076: worker can't be tailed due to abuse
    throw new Error(
      `Received error from server when creating tail!\n${JSON.stringify(
        await response.json()
      )}`
    );
  }
  // @ts-expect-error we need to type the api responses
  return (await response.json()).result;
}

export async function createTail(
  accountId: string,
  workerName: string,
  filters: Filters
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
    const response = await cfetch(deleteUrl, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(
        `Received error from server when deleting tail!\n${await response.json()}`
      );
    }
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
