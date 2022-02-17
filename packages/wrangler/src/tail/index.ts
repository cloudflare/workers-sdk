import WebSocket from "ws";
import { version as packageVersion } from "../../package.json";
import { fetchResult } from "../cfetch";
import type { ApiFilterMessage, Outcome } from "./filters";
export type { CliFilters } from "./filters";
export { translateCliCommandToApiFilterMessage } from "./filters";
export { jsonPrintLogs, prettyPrintLogs } from "./printing";

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

/**
 * Everything captured by the trace worker and sent to us via
 * `wrangler tail` is structured JSON that deserializes to this type.
 */
export type TailEventMessage = {
  /**
   * Whether the execution of this worker succeeded or failed
   */
  outcome: Outcome;

  /**
   * The name of the script we're tailing
   */
  scriptName?: string;

  /**
   * Any exceptions raised by the worker
   */
  exceptions: {
    /**
     * The name of the exception. Usually "Error", but if you
     * have custom error types could be e.g. "InvalidInputError"
     */
    name: string;

    /**
     * The error message
     */
    message: string;

    /**
     * When the exception was raised/thrown
     */
    timestamp: Date;
  }[];

  /**
   * Any logs sent out by the worker
   */
  logs: {
    message: string[];
    level: string; // TODO: make this a union of possible values
    timestamp: Date;
  }[];

  /**
   * When the event was triggered
   */
  eventTimestamp: Date;

  /**
   * The event that triggered the worker. In the case of an HTTP request,
   * this will be a RequestEvent. If it's a cron trigger, it'll be a
   * ScheduledEvent.
   *
   * Until workers-types exposes individual types for export, we'll have
   * to just re-define these types ourselves.
   */
  event: RequestEvent | ScheduledEvent;
};

/**
 * A request that triggered worker execution
 */
export type RequestEvent = {
  /**
   * Copied mostly from https://developers.cloudflare.com/workers/runtime-apis/request#properties
   * but with some properties omitted based on my own testing
   */
  request: {
    /**
     * The URL the request was sent to
     */
    url: string;

    /**
     * The request method
     */
    method: string;

    /**
     * Headers sent with the request
     */
    headers: Record<string, string>;

    /**
     * Cloudflare-specific properties
     * https://developers.cloudflare.com/workers/runtime-apis/request#incomingrequestcfproperties
     */
    cf: {
      /**
       * How long (in ms) it took for the client's TCP connection to make a
       * round trip to the worker and back. For all my gamers out there,
       * this is the request's ping
       */
      clientTcpRtt?: number;

      /**
       * Longitude and Latitude of where the request originated from
       */
      longitude?: string;
      latitude?: string;

      /**
       * What cipher was used to establish the TLS connection
       */
      tlsCipher: string;

      /**
       * Which continent the request came from.
       */
      continent?: "NA";

      /**
       * ASN of the incoming request
       */
      asn: number;

      /**
       * The country the incoming request is coming from
       */
      country?: string;

      /**
       * The TLS version the connection used
       */
      tlsVersion: string;

      /**
       * The colo that processed the request (i.e. the airport code
       * of the closest city to the server that spun up the worker)
       */
      colo: string;

      /**
       * The timezone where the request came from
       */
      timezone?: string;

      /**
       * The city where the request came from
       */
      city?: string;

      /**
       * The browser-requested prioritization information in the request object
       */
      requestPriority?: string;

      /**
       * Which version of HTTP the request came over e.g. "HTTP/2"
       */
      httpProtocol: string;

      /**
       * The region where the request originated from
       */
      region?: string;
      regionCode?: string;

      /**
       * The organization which owns the ASN of the incoming request, for example, Google Cloud.
       */
      asOrganization: string;

      /**
       * Metro code (DMA) of the incoming request, for example, "635".
       */
      metroCode?: string;

      /**
       * Postal code of the incoming request, for example, "78701".
       */
      postalCode?: string;
    };
  };
};

/**
 * An event that was triggered at a certain time
 */
export type ScheduledEvent = {
  /**
   * The cron pattern that matched when this event fired
   */
  cron: string;

  /**
   * The time this worker was scheduled to run.
   * For some reason, this doesn't...work correctly when we
   * do it directly as a Date. So parse it later on your own.
   */
  scheduledTime: number;
};
