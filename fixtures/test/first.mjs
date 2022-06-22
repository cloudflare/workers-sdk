import wrangler from "wrangler";

await wrangler.dev("../worker-app/src/index.js", {
  name: "some-worker-name",
});
