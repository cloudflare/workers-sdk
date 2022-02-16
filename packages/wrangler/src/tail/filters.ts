import type WebSocket from "ws";

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

export type ApiFilter =
  | SamplingRateFilter
  | OutcomeFilter
  | MethodFilter
  | HeaderFilter
  | ClientIpFilter
  | QueryFilter;

export type ApiFilterMessage = {
  filters: ApiFilter[];
  debug: boolean;
};

export function translateCliFiltersToApiFilters(
  cliFilters: TailCLIFilters
): ApiFilter[] {
  const apiFilters: ApiFilter[] = [];

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

function parseSamplingRate(sampling_rate: number): SamplingRateFilter {
  if (sampling_rate <= 0 || sampling_rate >= 1) {
    throw new Error(
      "A sampling rate must be between 0 and 1 in order to have any effect.\nFor example, a sampling rate of 0.25 means 25% of events will be logged."
    );
  }

  return { sampling_rate };
}

function parseOutcome(
  statuses: Array<"ok" | "error" | "canceled">
): OutcomeFilter {
  const outcomes = new Set<string>();
  for (const status of statuses) {
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

export function sendFilters(ws: WebSocket, message: ApiFilterMessage) {
  ws.send(
    JSON.stringify(message),
    { binary: false, compress: false, mask: false, fin: true },
    (err) => {
      if (err) {
        throw err;
      }
    }
  );
}
