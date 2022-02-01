import { generateAliasKey, generateKey } from "./utils/keys";

export const onRequestPost: PagesFunction<{ KV: KVNamespace }> = async ({
  request,
  env,
}) => {
  const formData = await request.formData();
  const tag = formData.get("tag") as string;
  const version = formData.get("version") as string;
  const file = formData.get("file") as File;

  const packageName = file.name.split(".tgz")[0];

  try {
    await env.KV.put(generateAliasKey({ tag, packageName }), version);
    await env.KV.put(generateKey({ tag, version, packageName }), file.stream());

    return new Response("Successfully uploaded.");
  } catch (thrown) {
    return new Response(`Could not upload package: ${thrown}.`, {
      status: 500,
    });
  }
};
