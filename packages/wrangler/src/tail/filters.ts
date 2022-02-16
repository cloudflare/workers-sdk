/**
 * When tailing logs from a worker, oftentimes you don't want to see _every
 * single event_. That's where filters come in. We can send a set of filters
 * to the tail worker, and it will pre-filter any logs for us so that we
 * only recieve the ones we care about.
 */

/**
 * These are the filters we accept in the CLI. They
 * were copied directly from wrangler 1 in order to
 * maintain compatability, so they aren't actually the exact
 * filters we need to send up to the tail worker.
 *
 * They generally map 1:1 , but often require some transformation or
 * renaming to match what it expects.
 */
export type CliFilters = {
  status?: Array<"ok" | "error" | "canceled">;
  header?: string;
  method?: string[];
  search?: string;
  samplingRate?: number;
  clientIp?: string[];
};

/**
 * These are the filters we send to the tail worker. We
 * actually send a list of filters (an array of objects),
 * so rather than having a single TailAPIFilters type,
 * each kind of filter gets its own type and we define
 * TailAPIFilter to be the union of those types.
 */
export type ApiFilter =
  | SamplingRateFilter
  | OutcomeFilter
  | MethodFilter
  | HeaderFilter
  | ClientIpFilter
  | QueryFilter;

/**
 * Filters logs based on a given sampling rate.
 * For example, a `sampling_rate` of 0.25 will let one-quarter of the
 * logs through.
 */
type SamplingRateFilter = {
  sampling_rate: number;
};

/**
 * Filters logs based on the outcome of the worker's event handler.
 * There are five possible outcomes we can get, three of which
 * (exception, exceededCpu, and unknown) are considered errors
 */
type OutcomeFilter = {
  outcome: Array<"ok" | "canceled" | "exception" | "exceededCpu" | "unknown">;
};

/**
 * Filters logs based on the HTTP method used for the request
 * that triggered the worker.
 */
type MethodFilter = {
  method: string[];
};

/**
 * Filters logs based on an HTTP header on the request that
 * triggered the worker.
 */
type HeaderFilter = {
  header: {
    /**
     * Filters on the header "key", e.g. "X-CLOUDFLARE-HEADER"
     * or "X-CUSTOM-HEADER"
     */
    key: string;

    /**
     * Filters on the header "value", e.g. if this is set to
     * "filter-for-me" and the "key" is "X-SHOULD-LOG", only
     * events triggered by requests with the header
     * "X-SHOULD-LOG:filter-for-me" will be logged.
     */
    query?: string;
  };
};

/**
 * Filters on the IP address the request came from that triggered
 * the worker. A value of "self" will be replaced with the IP
 * address that is running `wrangler tail`
 */
type ClientIpFilter = {
  client_ip: string[];
};

/**
 * Filters logs by a query string. This means only logs that
 * contain the given string will be sent to wrangler, and any
 * that don't will be discarded by the tail worker.
 */
type QueryFilter = {
  query: string;
};

/**
 * The full message we send to the tail worker includes our
 * filters and a debug flag.
 */
export type ApiFilterMessage = {
  filters: ApiFilter[];
  debug: boolean;
};

export function translateCliCommandToApiFilterMessage(
  cliFilters: CliFilters,
  debug: boolean
): ApiFilterMessage {
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

  return {
    filters: apiFilters,
    debug,
  };
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
  const outcomes = new Set<
    "ok" | "canceled" | "exception" | "exceededCpu" | "unknown"
  >();
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
