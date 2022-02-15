import WebSocket from "ws";
import { version as packageVersion } from "../package.json";
import { fetchResult } from "./cfetch";

export type TailApiResponse = {
  id: string;
  url: string;
  expires_at: Date;
};

export type TailCLIFilters = {
  status?: Array<"ok" | "error" | "canceled">;
  header?: string;
  method?: string[];
  search?: string;
  samplingRate?: number;
  clientIp?: string[];
};

// due to the trace worker being built around wrangler 1 and
// some other stuff, the filters we send to the API are slightly
// different than the ones we read from the CLI
type SamplingRateFilter = {
  sampling_rate: number;
};

type OutcomeFilter = {
  outcome: string[];
};

type MethodFilter = {
  method: string[];
};

type HeaderFilter = {
  header: {
    key: string;
    query?: string;
  };
};

type ClientIpFilter = {
  client_ip: string[];
};

type QueryFilter = {
  query: string;
};

type ApiFilter =
  | SamplingRateFilter
  | OutcomeFilter
  | MethodFilter
  | HeaderFilter
  | ClientIpFilter
  | QueryFilter;

type ApiFilterMessage = {
  filters: ApiFilter[];
  debug: boolean;
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
  return await fetchResult<TailApiResponse>(createTailUrl, {
    method: "POST",
  });
}

export async function createTail(
  accountId: string,
  workerName: string,
  filters: ApiFilter[]
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
    await fetchResult(deleteUrl, { method: "DELETE" });
  }

  const tail = new WebSocket(websocketUrl, "trace-v1", {
    headers: {
      "Sec-WebSocket-Protocol": "trace-v1", // needs to be `trace-v1` to be accepted
      "User-Agent": `wrangler-js/${packageVersion}`,
    },
  });

  // check if there's any filters to send
  if (filters.length === 0) {
    const message: ApiFilterMessage = {
      filters,
      // if debug is set to true, then all logs will be sent through.
      // logs that _would_ have been blocked will result with a message
      // telling you what filter would have rejected it
      debug: false,
    };

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
  }

  return { tail, expiration, deleteTail };
}

// TODO: should this validation step happen before connecting to the tail?
export function translateCliFiltersToApiFilters(
  cliFilters: TailCLIFilters
): ApiFilter[] {
  const apiFilters: ApiFilter[] = [];

  // TODO: do these all need to be their own functions or should
  // they just be inlined
  if (cliFilters.samplingRate) {
    apiFilters.push(parseSamplingRate(cliFilters.samplingRate));
  }

  if (cliFilters.status) {
    apiFilters.push(parseOutcome(cliFilters.status));
  }

  if (cliFilters.method) {
    apiFilters.push(parseMethod(cliFilters.method));
  }

  if (cliFilters.header) {
    apiFilters.push(parseHeader(cliFilters.header));
  }

  if (cliFilters.clientIp) {
    apiFilters.push(parseClientIp(cliFilters.clientIp));
  }

  if (cliFilters.search) {
    apiFilters.push(parseQuery(cliFilters.search));
  }

  return apiFilters;
}

function parseSamplingRate(samplingRate: number): SamplingRateFilter {
  if (samplingRate <= 0 || samplingRate >= 1) {
    throw new Error("A sampling rate must be between 0 and 1");
  }

  return { sampling_rate: samplingRate };
}

function parseOutcome(
  statuses: Array<"ok" | "error" | "canceled">
): OutcomeFilter {
  const outcomes = new Set<string>();
  for (const status in statuses) {
    switch (status) {
      case "ok":
        outcomes.add("ok");
        break;
      case "canceled":
        outcomes.add("canceled");
        break;
      // there's more than one way to error
      case "error":
        outcomes.add("exception");
        outcomes.add("exceededCpu");
        outcomes.add("unknown");
        break;
      default:
        break;
    }
  }

  return {
    outcome: Array.from(outcomes),
  };
}

// we actually don't need to do anything here
function parseMethod(method: string[]): MethodFilter {
  return { method };
}

function parseHeader(header: string): HeaderFilter {
  // headers of the form "HEADER-KEY: VALUE" get split.
  // the query is optional
  const [headerKey, headerQuery] = header.split(":", 2);
  return {
    header: {
      key: headerKey.trim(),
      query: headerQuery?.trim(),
    },
  };
}

function parseClientIp(client_ip: string[]): ClientIpFilter {
  return { client_ip };
}

function parseQuery(query: string): QueryFilter {
  return { query };
}

export function prettyPrintLogs(_data: WebSocket.RawData): void {
  throw new Error("TODO!");
}

export function jsonPrintLogs(data: WebSocket.RawData): void {
  console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
}
