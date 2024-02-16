export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const cookie = await fetch("https://playground-testing.devprod.cloudflare.dev")
  const header = cookie.headers.getSetCookie()
  const asset = await env.ASSETS.fetch(new URL(url.pathname.split("/playground")[1], "http://dummy"))
  if (url.pathname === "/playground") {
    return new Response(asset.body, {
      headers: {
        "Set-Cookie": header[0].replace("playground-testing.devprod.cloudflare.dev", url.host),
        ...asset.headers
      }
    })
  } else {
    return asset
  }
}
