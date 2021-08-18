import type { DtInspector } from "./api/inspect";
import type { CfAccount, CfWorkerInit } from "./api/worker";
import { CfWorker } from "./api/worker";

import type { Response } from "node-fetch";

if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
  throw new Error(
    "Please set CF_ACCOUNT_ID and CF_API_TOKEN (and optionally CF_ZONE_ID)"
  );
}

const account: CfAccount = {
  accountId: process.env.CF_ACCOUNT_ID,
  zoneId: process.env.CF_ZONE_ID,
  apiToken: process.env.CF_API_TOKEN,
};

const init: CfWorkerInit = {
  main: {
    name: "worker.js",
    type: "commonjs",
    content: `
    addEventListener('fetch', (event) => {
      console.log(
        event.request.method,
        event.request.url,
        new Map([...event.request.headers]),
        event.request.cf)

      event.respondWith(new Response(DATE))
    })`,
  },
  variables: {
    DATE: new Date().toISOString(),
  },
};

export async function main(): Promise<void> {
  const worker: CfWorker = new CfWorker(init, account);
  const inspector: DtInspector = await worker.inspect();
  //inspector.proxyTo(9230)

  for (let i = 0; i < 3; i++) {
    const response: Response = await worker.fetch("/hello");
    const { status, statusText } = response;
    const body = await response.text();
    console.log("Response:", status, statusText, body.substring(0, 100));
  }

  /*for await (const event of inspector.drain()) {
    console.log('Event:', event)
  }
  inspector.close()*/
}
