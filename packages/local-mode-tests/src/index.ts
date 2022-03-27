export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Hello World!");
  },
};
