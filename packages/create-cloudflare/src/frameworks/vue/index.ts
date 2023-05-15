import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
  await runFrameworkGenerator(
    ctx,
    `${npx} create-vue@latest ${ctx.project.name}`
  );
};

const config: FrameworkConfig = {
  generate,
  displayName: "Vue",
  packageScripts: {
    "pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
    "pages:deploy": `${npm} run build && wrangler pages publish ./dist`,
  },
  testFlags: ["--ts"],
};
export default config;
