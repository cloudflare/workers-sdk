import process from "process";

export default {
  async fetch(): Promise<Response> {
    console.log("process.env: ", process.env);
    return new Response("Hello World!");
  },
};
