import path from "path";
import fs from "fs/promises";
import os from "os";
import { Config, writeRoutesModule } from "./routes";
import { buildWorker } from "./buildWorker";
import { generateConfigFromFileTree } from "./filepath-routing";
import { Options } from "./cli";

export async function build(
  baseDir,
  {
    minify = false,
    config: configPath,
    outfile = "out/worker-bundle.mjs",
    outputConfig = "",
    baseURL = "/",
    watch = false,
  }: Options
) {
  let config: Config;
  if (configPath) {
    config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } else {
    config = await generateConfigFromFileTree({ baseDir, baseURL });
  }

  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "pages-functions-compiler-")
  );
  const routesModule = path.join(tmpDir, "routes.mjs");

  await writeRoutesModule({
    config,
    srcDir: baseDir,
    outfile: routesModule,
  });

  await buildWorker({ routesModule, outfile, minify, watch });

  if (outputConfig) {
    await fs.writeFile(
      outputConfig,
      JSON.stringify({ ...config, baseURL }, null, 2)
    );
  }
}
