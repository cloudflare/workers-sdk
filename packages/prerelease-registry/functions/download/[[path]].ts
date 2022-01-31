export const onRequestGet: PagesFunction<{ KV: KVNamespace }, "path"> = async ({
  params,
  env,
}) => {
  const { path } = params;

  let tag: string, version: string, fileName: string;

  if (Array.isArray(path) && path.length === 3) {
    [tag, version, fileName] = path;
  } else {
    [tag, fileName] = path;
  }

  const packageName = fileName.split(".tgz")[0];

  if (version === undefined) {
    version = await env.KV.get(
      `wrangler:tag:${tag}:package:${packageName}`,
      "text"
    );

    if (version === null) {
      return new Response(null, { status: 404 });
    }
  }

  const fileStream = await env.KV.get(
    `wrangler:tag:${tag}:package:${packageName}:version:${version}`,
    "stream"
  );

  if (fileStream === null) {
    return new Response(null, { status: 404 });
  }

  return new Response(fileStream);
};
