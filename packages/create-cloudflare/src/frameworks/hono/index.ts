import { logRaw } from "helpers/cli";
import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
  await runFrameworkGenerator(
    ctx,
    `${npx} create-hono@latest ${ctx.project.name} --template cloudflare-pages`
  );

  logRaw(""); // newline
};

const config: FrameworkConfig = {
  generate,
  displayName: "Hono",
  packageScripts: {},
  deployCommand: "deploy",
  devCommand: "dev",
};
export default config;
