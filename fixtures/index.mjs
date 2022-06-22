import wrangler from "wrangler";

export const someFunc = async () => {
  const something = await wrangler.dev("./worker-app/src/index.js", {
    name: "hiiii",
  });
  console.log("something: ", something);
};

await someFunc();
