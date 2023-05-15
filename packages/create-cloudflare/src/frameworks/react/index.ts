import { logRaw } from "helpers/cli";
import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
  await runFrameworkGenerator(
    ctx,
    `${npx} create-react-app ${ctx.project.name}`
  );

  logRaw("");
};

const config: FrameworkConfig = {
  generate,
  displayName: "React",
  packageScripts: {
    "pages:dev": `wrangler pages dev ${compatDateFlag()} --port 3000 -- ${npm} start`,
    "pages:deploy": `${npm} run build && wrangler pages publish ./build`,
  },
};
export default config;
