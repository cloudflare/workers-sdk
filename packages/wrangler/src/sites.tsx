import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import ignore from "ignore";
import { fetchResult } from "./cfetch";
import type { Config } from "./config";
import { listNamespaceKeys, listNamespaces, putBulkKeyValue } from "./kv";

async function* getFilesInFolder(dirPath: string): AsyncIterable<string> {
  const files = await readdir(dirPath, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* await getFilesInFolder(path.join(dirPath, file.name));
    } else {
      yield path.join(dirPath, file.name);
    }
  }
}

async function hashFileContent(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const rs = createReadStream(filePath);
    rs.on("error", reject);
    rs.on("data", (chunk) => hash.update(chunk));
    rs.on("end", () => resolve(hash.digest("hex")));
  });
}

async function hashAsset(filePath: string): Promise<{
  assetKey: string;
  hash: string;
}> {
  const extName = path.extname(filePath);
  const baseName = path.basename(filePath, extName);
  const hash = await hashFileContent(filePath);
  return {
    assetKey: `${baseName}.${hash}${extName || ""}`,
    hash,
  };
}

async function createKVNamespaceIfNotAlreadyExisting(
  title: string,
  accountId: string
) {
  // check if it already exists
  // TODO: this is super inefficient, should be made better
  const namespaces = await listNamespaces(accountId);
  const found = namespaces.find((x) => x.title === title);
  if (found) {
    return { created: false, id: found.id };
  }

  // else we make the namespace
  // TODO: use an export from ./kv
  const json = await fetchResult<{ id: string }>(
    `/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  return {
    created: true,
    id: json.id,
  };
}

/**
 * Upload the assets found within the `dirPath` directory to the sites assets KV namespace for
 * the worker given by `scriptName`.
 *
 * @param accountId the account to upload to.
 * @param scriptName the name of the worker whose assets we are uploading.
 * @param siteAssets an objects describing what assets to upload, or undefined if there are no assets to upload.
 * @param preview if true then upload to a "preview" KV namespace.
 * @param _env (not implemented).
 * @returns a promise for an object mapping the relative paths of the assets to the key of that
 * asset in the KV namespace.
 */
export async function syncAssets(
  accountId: string,
  scriptName: string,
  siteAssets: AssetPaths | undefined,
  preview: boolean,
  _env?: string
): Promise<{
  manifest: { [filePath: string]: string } | undefined;
  namespace: string | undefined;
}> {
  if (siteAssets === undefined) {
    return { manifest: undefined, namespace: undefined };
  }

  const title = `__${scriptName}_sites_assets${preview ? "_preview" : ""}`;
  const { id: namespace } = await createKVNamespaceIfNotAlreadyExisting(
    title,
    accountId
  );

  // let's get all the keys in this namespace
  const result = await listNamespaceKeys(accountId, namespace);
  const keys = new Set(result.map((x) => x.name));

  const manifest = {};
  const upload: {
    key: string;
    value: string;
    base64: boolean;
  }[] = [];

  const include = createPatternMatcher(siteAssets.includePatterns, false);
  const exclude = createPatternMatcher(siteAssets.excludePatterns, true);

  // TODO: this can be more efficient by parallelising
  for await (const file of getFilesInFolder(siteAssets.baseDirectory)) {
    const relativePath = path.relative(siteAssets.baseDirectory, file);
    if (!include(relativePath)) {
      continue;
    }
    if (exclude(relativePath)) {
      continue;
    }
    const { assetKey } = await hashAsset(file);
    // now put each of the files into kv
    if (!keys.has(assetKey)) {
      console.log(`uploading ${file}...`);
      const content = await readFile(file, "base64");
      if (content.length > 25 * 1024 * 1024) {
        throw new Error(`File ${file} is too big, it should be under 25 mb.`);
      }
      upload.push({
        key: assetKey,
        value: content,
        base64: true,
      });
    }
    manifest[path.relative(siteAssets.baseDirectory, file)] = assetKey;
  }
  await putBulkKeyValue(accountId, namespace, JSON.stringify(upload));
  return { manifest, namespace };
}

function createPatternMatcher(
  patterns: string[],
  exclude: boolean
): (filePath: string) => boolean {
  if (patterns.length === 0) {
    return (_filePath) => !exclude;
  } else {
    const ignorer = ignore().add(patterns);
    return (filePath) => ignorer.test(filePath).ignored;
  }
}

/**
 * Information about the assets that should be uploaded
 */
export interface AssetPaths {
  baseDirectory: string;
  includePatterns: string[];
  excludePatterns: string[];
}

/**
 * Get an object that describes what assets to upload, if any.
 *
 * Uses the args (passed from the command line) if available,
 * falling back to those defined in the config.
 *
 * // TODO: Support for environments
 */
export function getAssetPaths(
  config: Config,
  baseDirectory = config.site?.bucket,
  includePatterns = config.site?.include ?? [],
  excludePatterns = config.site?.exclude ?? []
): undefined | AssetPaths {
  return baseDirectory
    ? {
        baseDirectory,
        includePatterns,
        excludePatterns,
      }
    : undefined;
}
