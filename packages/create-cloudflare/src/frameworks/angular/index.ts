import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { brandColor, dim } from "helpers/colors";
import {
  detectPackageManager,
  installPackages,
  runCommand,
  runFrameworkGenerator,
} from "helpers/command";
import { readFile, readJSON, writeFile } from "helpers/files";
import { spinner } from "helpers/interactive";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
  await runFrameworkGenerator(
    ctx,
    `${npx} @angular/cli@next new ${ctx.project.name} --standalone`
  );
};

const configure = async (ctx: PagesGeneratorContext) => {
  process.chdir(ctx.project.path);
  await runCommand(`${npx} @angular/cli@next analytics disable`, {
    silent: true,
  });
  await addSSRAdaptor();
  await installCFWorker(ctx);
  await updateAppCode();
  await updateAngularJson(ctx);
};

const config: FrameworkConfig = {
  generate,
  configure,
  displayName: "Angular",
  packageScripts: {
    process:
      "node ./tools/copy-worker-files.mjs && node ./tools/copy-client-files.mjs && node ./tools/bundle.mjs",
    prestart: "npm run build:ssr && npm run process",
    start:
      "wrangler pages dev dist/cloudflare --compatibility-date=2021-09-20 --experimental-local",
    predeploy: "npm run build:ssr && npm run process",
    deploy: "wrangler pages publish dist/cloudflare",
  },
  deployCommand: "deploy",
  devCommand: "start",
};
export default config;

async function installCFWorker(ctx: PagesGeneratorContext) {
  const s = spinner();
  s.start(`Adding Cloudflare Pages adaptor code`);
  await cp(
    // eslint-disable-next-line no-restricted-globals
    resolve(__dirname, "./angular/templates"),
    resolve(ctx.project.path),
    { recursive: true, force: true }
  );
  s.stop(`${brandColor("added")} ${dim("Cloudflare Pages adaptor code`")}`);

  await installPackages(
    [
      "@cloudflare/workers-types",
      "@esbuild-plugins/node-globals-polyfill",
      "@esbuild-plugins/node-modules-polyfill",
      "@miniflare/tre@next",
      "esbuild",
      "fast-glob",
      "wrangler@beta",
    ],
    {
      dev: true,
      startText: "Installing adaptor dependencies",
      doneText: "Installed",
    }
  );
}

async function addSSRAdaptor() {
  await runCommand(
    `${npx} ng add @nguniversal/express-engine --skip-confirmation`,
    {
      silent: true,
      startText: "Installing Angular SSR",
      doneText: `${brandColor("installed")}`,
    }
  );
}

async function updateAppCode() {
  const s = spinner();
  s.start(`Updating application code`);

  // Add the `provideClientHydration()` provider to the app config.
  const appConfig = readFile(resolve("src/app/app.config.ts"));
  const newAppConfig =
    "import { provideClientHydration } from '@angular/platform-browser';\n" +
    appConfig.replace("providers: [", "providers: [provideClientHydration(), ");
  await writeFile(resolve("src/app/app.config.ts"), newAppConfig);

  // Remove the unwanted node.js server entry-point
  await rm(resolve("server.ts"));

  s.stop(`Done updating application code`);
}

function updateAngularJson(ctx: PagesGeneratorContext) {
  const s = spinner();
  s.start(`Updating angular.json config`);
  const angularJson = readJSON(resolve("angular.json"));
  const architectSection = angularJson.projects[ctx.project.name].architect;
  architectSection.build.options.outputPath = "dist/browser";
  architectSection.build.options.assets.push("src/_routes.json");
  architectSection.server.options.outputPath = "dist/server";
  architectSection.server.options.main = "src/main.server.ts";
  delete architectSection["serve-ssr"];

  writeFile(resolve("angular.json"), JSON.stringify(angularJson, null, 2));
  s.stop(`Updated angular.json config`);
}
