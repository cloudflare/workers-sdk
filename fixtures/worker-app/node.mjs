import { unstable_dev } from "wrangler";

const worker = await unstable_dev("./src/index.js");

const res = await worker.fetch("https://example.com");

console.log(res.status, await res.text());
