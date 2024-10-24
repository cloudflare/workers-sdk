import { unstable_dev } from "wrangler";

//since the script is invoked from the directory above, need to specify index.js is in src/
const worker = await unstable_dev("dist/out.js", { config: "wrangler.toml" });

const resp = await worker.fetch("http://localhost:8787/");
const text = await resp.text();

console.log("Invoked worker: ", text);

await worker.stop();

process.exit(0);
