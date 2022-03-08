import content from "./content.md";

addEventListener("fetch", (event) => {
  event.respondWith(new Response(`${event.request.url}: ${content}`));
});
