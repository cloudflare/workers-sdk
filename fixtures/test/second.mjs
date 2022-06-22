import wrangler from "wrangler";
import undici from "undici";

await wrangler.dev("../worker-app/src/index.js", {
  name: "some-worker-name",
  local: true,
});

await new Promise((resolve) => setTimeout(resolve, 500));

const resp = await undici.fetch("http://localhost:8787/");
const text = await resp.text();

console.log("===================================");
console.log("===================================");
console.log("===================================");
console.log("===================================");
console.log("Logging from outside of wrangler!");
console.log("does response include localhost: ", text.includes("localhost"));
console.log("===================================");
console.log("===================================");
console.log("===================================");
console.log("===================================");
