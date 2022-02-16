import { setTimeout } from "node:timers/promises";
import type { WebSocket } from "ws";

export async function waitForWebsocketConnection(ws: WebSocket) {
  while (ws.readyState !== ws.OPEN) {
    switch (ws.readyState) {
      case ws.CONNECTING:
        await setTimeout(1000);
        break;
      case ws.CLOSING:
        await setTimeout(1000);
        break;
      case ws.CLOSED:
        throw new Error("Websocket closed unexpectedly!");
    }
  }
  return;
}
