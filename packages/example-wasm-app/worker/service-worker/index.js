import * as worker from "./index_bg.js";

addEventListener("fetch", (event) => {
  event.respondWith(worker.fetch(event.request));
});
