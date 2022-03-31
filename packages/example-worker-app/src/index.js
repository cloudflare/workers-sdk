import { now } from "./dep";
export default {
  fetch(request) {
    console.log(
      request.method,
      request.url,
      new Map([...request.headers]),
      request.cf
    );

    return new Response(`${request.url} ${now()}`);
  },

  /**
   * Handle a scheduled event.
   *
   * If developing using `--local` mode, you can trigger this scheduled event via a CURL.
   * E.g. `curl "http://localhost:8787/cdn-cgi/mf/scheduled"`.
   * See the Miniflare docs: https://miniflare.dev/core/scheduled.
   */
  scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.resolve(event.scheduledTime));
    ctx.waitUntil(Promise.resolve(event.cron));
  },
};

// addEventListener("fetch", (event) => {
//   event.respondWith(handleRequest(event.request));
// });

// async function handleRequest(request) {
//   return new Response("Hello worker!", {
//     headers: { "content-type": "text/plain" },
//   });
// }
