import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";

let cacheMessageShown = false;

const cacheFolder = "node_modules/.cache/wrangler";

const showCacheMessage = () => {
  if (!cacheMessageShown) {
    console.log(
      `Using cached values in '${cacheFolder}'. This is used as a temporary store to improve the developer experience for some commands. It may be purged at any time. It doesn't contain any sensitive information, but it should not be commited into source control.`
    );
    cacheMessageShown = true;
  }
};

export const getConfigCache = <T>(fileName: string): Partial<T> => {
  try {
    const configCacheLocation = join(cacheFolder, fileName);
    const configCache = JSON.parse(readFileSync(configCacheLocation, "utf-8"));
    showCacheMessage();
    return configCache;
  } catch {
    return {};
  }
};

export const saveToConfigCache = <T>(
  fileName: string,
  newValues: Partial<T>
) => {
  const configCacheLocation = join(cacheFolder, fileName);
  const existingValues = getConfigCache(fileName);

  mkdirSync(dirname(configCacheLocation), { recursive: true });
  writeFileSync(
    configCacheLocation,
    JSON.stringify({ ...existingValues, ...newValues }, null, 2)
  );
  showCacheMessage();
};

export const purgeConfigCaches = () => {
  rmSync(cacheFolder, { recursive: true, force: true });
};
