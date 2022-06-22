import wrangler from "wrangler";
import undici from "undici";

// Test the wrangler module with jest's describe block
describe("wrangler", () => {
  it("should be a function", async () => {
    await wrangler.dev("../worker-app/src/index.js", {
      name: "some-worker-name",
      local: true,
    });
    console.log("hmm");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const text = await (await undici.fetch("http://localhost:8787")).text();
    expect(text).toContain("localhost:8787");
  });
});
