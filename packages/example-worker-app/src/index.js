import { now } from "./dep";
export default {
  async fetch(request) {
    console.log(
      request.method,
      request.url,
      new Map([...request.headers]),
      request.cf
    );

    const catFacts = await fetch("https://cat-fact.herokuapp.com/facts");

    return new Response(
      `${request.url} ${now()}\n ${JSON.stringify(
        await catFacts.json(),
        null,
        "  "
      )}`
    );
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
