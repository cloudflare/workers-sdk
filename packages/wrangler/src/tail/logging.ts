import { waitForWebsocketConnection } from "./util";
import type { Tail } from "./index";

export async function jsonPrintLogs(tail: Tail, scriptName: string) {
  console.log(
    `successfully created tail, expires at ${tail.expiration.toLocaleString()}`
  );

  tail.ws.on("message", (data) => {
    console.log(JSON.stringify(JSON.parse(data.toString()), null, 2));
  });

  await waitForWebsocketConnection(tail.ws);

  console.log(`Connected to ${scriptName}, waiting for logs...`);
}
