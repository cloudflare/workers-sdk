import type WebSocket from "ws";

export function prettyPrintLogs(data: WebSocket.RawData): void {
  throw new Error("TODO!");
}

export function jsonPrintLogs(data: WebSocket.RawData): void {
  console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
}
