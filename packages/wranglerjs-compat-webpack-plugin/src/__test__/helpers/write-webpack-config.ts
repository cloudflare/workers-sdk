import fs from "node:fs";
import path from "node:path";
import toSource from "tosource";
import type { Configuration } from "webpack";

export function writeWebpackConfig(
  config: Configuration = {},
  { filepath = "webpack.config.js" }: { filepath?: string } = {}
) {
  const stringified = `module.exports = ${toSource(config)}`;
  fs.writeFileSync(path.resolve(filepath), stringified);
}
