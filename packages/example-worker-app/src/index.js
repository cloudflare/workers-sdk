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
};

// addEventListener("fetch", (event) => {
//   event.respondWith(handleRequest(event.request));
// });

// async function handleRequest(request) {
//   return new Response("Hello worker!", {
//     headers: { "content-type": "text/plain" },
//   });
// }
