import { ProxyD1 } from './proxy-client';

const proxy = new ProxyD1('http://localhost:4321');

export default {
  async fetch(_req: Request) {
    console.log("Identity Worker: Sending query to proxy...");
    try {
      const result = await proxy.prepare("SELECT message FROM users LIMIT 1").first();
      console.log("Identity Worker: Received result:", result);
      return new Response(result?.message || "no user found");
    } catch (err) {
      console.error("Identity Worker: Error from proxy:", err.message);
      return new Response("IDENTITY ERROR: " + err.message);
    }
  }
};
