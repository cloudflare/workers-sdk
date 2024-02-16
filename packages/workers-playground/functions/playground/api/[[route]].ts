export function onRequest({ request }) {
  const url = new URL(request.url)
  return fetch(new URL(url.pathname.split("/playground")[1], `https://playground-testing.devprod.cloudflare.dev`), request)
}
