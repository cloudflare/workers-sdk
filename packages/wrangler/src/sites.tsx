import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fetchResult } from "./cfetch";
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

async function hashFile(filePath: string): Promise<{
  filePath: string;
  hash: string;
}> {
  const extName = path.extname(filePath);
  const baseName = path.basename(filePath, extName);
  const hash = await hashFileContent(filePath);
  return {
    filePath: `${baseName}.${hash}${extName || ""}`,
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
 * @param dirPath the path to the directory of assets to upload, or undefined if there are no assets to upload.
 * @param preview if true then upload to a "preview" KV namespace.
 * @param _env (not implemented).
 * @returns a promise for an object mapping the relative paths of the assets to the key of that
 * asset in the KV namespace.
 */
export async function syncAssets(
  accountId: string,
  scriptName: string,
  dirPath: string | undefined,
  preview: boolean,
  _env?: string
): Promise<{
  manifest: { [filePath: string]: string } | undefined;
  namespace: string | undefined;
}> {
  if (dirPath === undefined) {
    return { manifest: undefined, namespace: undefined };
  }

  const title = `__${scriptName}_sites_assets${preview ? "_preview" : ""}`;
  const { id: namespace } = await createKVNamespaceIfNotAlreadyExisting(
    title,
    accountId
  );

  // let's get all the keys in this namespace
  const keys = new Set(
    (await listNamespaceKeys(accountId, namespace)).map((x) => x.name)
  );

  const manifest = {};
  const upload: {
    key: string;
    value: string;
    base64: boolean;
  }[] = [];
  // TODO: this can be more efficient by parallelising
  for await (const file of getFilesInFolder(dirPath)) {
    // TODO: "exclude:" config
    const { filePath } = await hashFile(file);
    // now put each of the files into kv
    if (!keys.has(filePath)) {
      console.log(`uploading ${file}...`);
      const content = await readFile(file, "base64");
      if (content.length > 25 * 1024 * 1024) {
        throw new Error(`File ${file} is too big, it should be under 25 mb.`);
      }
      upload.push({
        key: filePath,
        value: content,
        base64: true,
      });
    }
    manifest[path.relative(dirPath, file)] = filePath;
  }
  await putBulkKeyValue(accountId, namespace, JSON.stringify(upload));
  return { manifest, namespace };
}
