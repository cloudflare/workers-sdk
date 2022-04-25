import chalk from "chalk";
import checkForUpdate from "update-check";
import pkg from "../package.json";

export async function updateCheck(): Promise<string> {
  let update = null;
  try {
    // default cache for update check is 1 day
    update = await checkForUpdate(pkg, {
      distTag: pkg.version.startsWith("0.0.0") ? "alpha" : "beta", // TODO: change this after https://github.com/cloudflare/wrangler2/pull/805 lands
    });
  } catch (err) {
    // ignore error
  }

  if (update) return `(update available ${chalk.green(update.latest)})`;

  return "";
}
