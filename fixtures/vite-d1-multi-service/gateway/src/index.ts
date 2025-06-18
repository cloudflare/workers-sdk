export default {
  async fetch(request: Request, env: Env) {
    const idResp = await env.IDENTITY_SERVICE.fetch("http://dummy-id");
    const passResp = await env.PASSPORT_SERVICE.fetch("http://dummy-pass");

    return new Response(JSON.stringify({
      identity: await idResp.text(),
      passport: await passResp.text(),
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

interface Env {
  IDENTITY_SERVICE: Fetcher;
  PASSPORT_SERVICE: Fetcher;
}
