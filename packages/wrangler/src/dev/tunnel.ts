import clipboardy from "clipboardy";
import { Routes } from "dev-tunnel";
import {
  TUNNEL_TTL_SECONDS,
  TUNNEL_WORKER_URL,
} from "dev-tunnel/src/constants";
import { useEffect, useState } from "react";
import { fetch } from "undici";
import { logger } from "../logger";
import type {
  TunnelShutdownRequest,
  TunnelCreationRequest,
  TunnelCreationResponse,
  TunnelHeartbeatRequest,
} from "dev-tunnel";

const toUrl = (route: Routes) => `${TUNNEL_WORKER_URL}${route}`;

const createTunnel = async (body: TunnelCreationRequest) => {
  const response = await fetch(toUrl(Routes.CREATE), {
    body: JSON.stringify(body),
    method: "POST",
  });
  if (response.ok) {
    return (await response.json()) as TunnelCreationResponse;
  }

  throw new Error(await response.text());
};

const sendHeartbeat = async (body: TunnelHeartbeatRequest) => {
  const response = await fetch(toUrl(Routes.HEARTBEAT), {
    body: JSON.stringify(body),
    method: "PATCH",
  });
  if (response.ok) {
    return;
  }

  throw new Error(await response.text());
};

const shutdownTunnel = async (body: TunnelShutdownRequest) => {
  const response = await fetch(toUrl(Routes.SHUTDOWN), {
    body: JSON.stringify(body),
    method: "DELETE",
  });

  if (response.ok) {
    return;
  }

  throw new Error(await response.text());
};

/**
 * React hook for sending heartbeats to a given tunnel ID
 *
 * @param id the tunnel ID to send a heartbeat for
 */
const useHeartbeat = (id?: string) => {
  const ms = (TUNNEL_TTL_SECONDS - 60) * 1000;
  const [timer, setTimer] = useState<NodeJS.Timer>();

  useEffect(() => {
    if (id !== undefined) {
      if (timer !== undefined) {
        clearInterval(timer);
      }
      setTimer(setInterval(async () => await sendHeartbeat({ id }), ms));
    } else if (timer !== undefined) {
      clearInterval(timer);
    }

    return () => {
      if (timer !== undefined) {
        clearInterval(timer);
      }
    };
  }, [id, ms, timer]);
};

/**
 * React hook to generate a URL that will proxy requests to the local `dev` session
 */
export const useTunnel = ({
  toggle,
  port,
  ip,
  localProtocol,
}: {
  toggle: boolean;
  port: number;
  ip: string;
  localProtocol: "http" | "https";
}): string | undefined => {
  const [tunnelID, setTunnelID] = useState<string>();
  const [tunnelURL, setTunnelURL] = useState<string>();
  useHeartbeat(tunnelID);

  const sessionUrl = `${localProtocol}://${ip}:${port}`;

  useEffect(() => {
    if (toggle && tunnelID === undefined) {
      logger.log("⎔ Sharing session...");
      void createTunnel({
        sessionUrl,
      }).then(({ id, url }) => {
        setTunnelID(id);
        setTunnelURL(url);
        clipboardy.writeSync(url);
        logger.log(`⬣ Sharing at ${url}, copied to clipboard.`);
      });
    } else if (tunnelID !== undefined) {
      void shutdownTunnel({ id: tunnelID }).then(() => {
        setTunnelID(undefined);
        setTunnelURL(undefined);
        logger.log("⎔ Ending share session.");
      });
    }

    return () => {
      if (tunnelID) {
        void shutdownTunnel({ id: tunnelID }).then(() => {});
      }
    };
  }, [toggle, sessionUrl, tunnelID]);

  return tunnelURL;
};
