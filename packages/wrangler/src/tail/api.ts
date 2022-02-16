import { fetchResult } from "../cfetch";

type CreateTailApiResponse = {
  id: string;
  url: string;
  expires_at: Date;
};

function makeCreateTailUrl(accountId: string, workerName: string): string {
  return `/accounts/${accountId}/workers/scripts/${workerName}/tails`;
}

export function makeDeleteTailUrl(
  accountId: string,
  workerName: string,
  tailId: string
): string {
  return `/accounts/${accountId}/workers/scripts/${workerName}/tails/${tailId}`;
}

// Creates a tail (tells the API to open a websocket), but doesn't connect to it.
export async function createTailButDontConnect(
  accountId: string,
  workerName: string
): Promise<CreateTailApiResponse> {
  const createTailUrl = makeCreateTailUrl(accountId, workerName);
  // https://api.cloudflare.com/#worker-tail-logs-start-tail
  return await fetchResult<CreateTailApiResponse>(createTailUrl, {
    method: "POST",
  });
}
