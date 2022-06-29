import undici from "undici";
import wrangler from "wrangler";

//since the script is invoked from the directory above, need to specify index.js is in src/
await wrangler.unstable_dev("src/index.js");

const resp = await undici.fetch("http://localhost:8787/");
const text = await resp.text();

console.log("Invoked worker: ", text);
