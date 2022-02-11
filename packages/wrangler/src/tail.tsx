import WebSocket from "ws";
import { version as packageVersion } from "../package.json";
import { fetchResult } from "./cfetch";

export type TailApiResponse = {
  id: string;
  url: string;
  expires_at: Date;
};

export type CliFilters = {
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
type ApiFilters = {
  sampling_rate?: number;
  // TODO: type this more strongly
  outcome?: string[];
  method?: string[];
  header?: { key: string; query?: string };
  client_ip?: string[];
  query?: string;
};

type ApiFilterMessage = {
  data: {
    filters: ApiFilters;
    debug: boolean;
  };
};

// TODO: make this a real type if we wanna pretty-print
type TailMessage = string;

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
  filters: CliFilters
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
  const hasFilters =
    filters !== undefined &&
    !Object.values(filters).every((value) => value === undefined);
  if (hasFilters) {
    const message = translateCliFiltersToApiFilterMessage(filters);

    tail.on("open", function (this) {
      this.send(
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
function translateCliFiltersToApiFilterMessage(
  cliFilters: CliFilters
): ApiFilterMessage {
  const apiFilters: ApiFilters = {};

  // TODO: do these all need to be their own functions or should
  // they just be inlined
  if (cliFilters.samplingRate) {
    apiFilters.sampling_rate = parseSamplingRate(cliFilters.samplingRate);
  }

  if (cliFilters.status) {
    apiFilters.outcome = parseOutcome(cliFilters.status);
  }

  if (cliFilters.method) {
    apiFilters.method = parseMethod(cliFilters.method);
  }

  if (cliFilters.header) {
    apiFilters.header = parseHeader(cliFilters.header);
  }

  if (cliFilters.clientIp) {
    apiFilters.client_ip = parseClientIp(cliFilters.clientIp);
  }

  if (cliFilters.search) {
    apiFilters.query = parseQuery(cliFilters.search);
  }

  return {
    data: {
      filters: apiFilters,
      // if debug is set to true, then all logs will be sent through.
      // logs that _would_ have been blocked will result with a message
      // telling you what filter would have rejected it
      debug: false,
    },
  };
}

function parseSamplingRate(samplingRate: number): number {
  if (samplingRate <= 0 || samplingRate >= 1) {
    throw new Error("A sampling rate must be between 0 and 1");
  }

  return samplingRate;
}

function parseOutcome(statuses: Array<"ok" | "error" | "canceled">): string[] {
  const outcomes: string[] = [];
  for (const status in statuses) {
    switch (status) {
      case "ok":
        outcomes.push("ok");
        break;
      case "canceled":
        outcomes.push("canceled");
        break;
      // there's more than one way to error
      case "error":
        outcomes.push("exception");
        outcomes.push("exceededCpu");
        outcomes.push("unknown");
        break;
      default:
        break;
    }
  }

  // filter for unique values
  return outcomes.filter((value, i, arr) => arr.indexOf(value) === i);
}

// we actually don't need to do anything here
function parseMethod(methods: string[]): string[] {
  return methods;
}

function parseHeader(header: string): { key: string; query?: string } {
  // headers of the form "HEADER-KEY: VALUE" get split.
  // the query is optional
  const [headerKey, headerQuery] = header.split(":", 2);
  return {
    key: headerKey.trim(),
    query: headerQuery?.trim(),
  };
}

// TODO: we _could_ validate this if we wanted to but seems extraneous
function parseClientIp(ips: string[]): string[] {
  return ips;
}

function parseQuery(search: string): string {
  return search;
}

export function prettyPrintLogs(data: WebSocket.RawData): void {
  throw new Error("TODO!");
}

export function jsonPrintLogs(data: WebSocket.RawData): void {
  console.log(JSON.stringify(JSON.parse(data.toString()), null, "  "));
}
