import { ProxyD1 } from './proxy-client';

const proxy = new ProxyD1('http://localhost:4321');

export default {
  async fetch(_req: Request) {
    console.log("Passport Worker: Sending test query to proxy...");
    try {
      const result = await proxy.prepare("SELECT 'passport works' as message").first();
      console.log("Passport Worker: Received result:", result);
      return new Response(result?.message || "no data");
    } catch (err) {
      console.error("❌ Passport Worker: Error from proxy:", err.message);
      return new Response("PASSPORT ERROR: " + err.message);
    }
  }
};
