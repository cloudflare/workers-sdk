import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toUrlPath } from "../paths";
import { buildPlugin } from "./functions/buildPlugin";
import { buildWorker } from "./functions/buildWorker";
import { generateConfigFromFileTree } from "./functions/filepath-routing";
import { writeRoutesModule } from "./functions/routes";
import type { Config } from "./functions/routes";
import type { BuildResult } from "esbuild";

export const RUNNING_BUILDERS: BuildResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
  CLEANUP_CALLBACKS.forEach((callback) => callback());
  RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

export async function buildFunctions({
  outfile,
  outputConfigPath,
  functionsDirectory,
  minify = false,
  sourcemap = false,
  fallbackService = "ASSETS",
  watch = false,
  onEnd,
  plugin = false,
  buildOutputDirectory,
  nodeCompat,
}: {
  outfile: string;
  outputConfigPath?: string;
  functionsDirectory: string;
  minify?: boolean;
  sourcemap?: boolean;
  fallbackService?: string;
  watch?: boolean;
  onEnd?: () => void;
  plugin?: boolean;
  buildOutputDirectory?: string;
  nodeCompat?: boolean;
}) {
  RUNNING_BUILDERS.forEach(
    (runningBuilder) => runningBuilder.stop && runningBuilder.stop()
  );

  const routesModule = join(tmpdir(), `./functionsRoutes-${Math.random()}.mjs`);
  const baseURL = toUrlPath("/");

  const config: Config = await generateConfigFromFileTree({
    baseDir: functionsDirectory,
    baseURL,
  });

  if (outputConfigPath) {
    writeFileSync(
      outputConfigPath,
      JSON.stringify({ ...config, baseURL }, null, 2)
    );
  }

  await writeRoutesModule({
    config,
    srcDir: functionsDirectory,
    outfile: routesModule,
  });

  if (plugin) {
    RUNNING_BUILDERS.push(
      await buildPlugin({
        routesModule,
        outfile,
        minify,
        sourcemap,
        watch,
        nodeCompat,
        onEnd,
      })
    );
  } else {
    RUNNING_BUILDERS.push(
      await buildWorker({
        routesModule,
        outfile,
        minify,
        sourcemap,
        fallbackService,
        watch,
        onEnd,
        buildOutputDirectory,
        nodeCompat,
      })
    );
  }
}

export const pagesBetaWarning =
  "🚧 'wrangler pages <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose";
