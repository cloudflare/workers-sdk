import type { BuilderCallback } from "yargs";

export const pages: BuilderCallback<unknown, unknown> = (yargs) => {
  return yargs.command(
    "dev",
    "🧑‍💻 Develop your full-stack Pages application locally",
    () => {},
    () => {
      console.log("pages dev");
    }
  );
};
