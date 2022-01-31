export const onRequestPost: PagesFunction<{ KV: KVNamespace }> = async ({
  request,
  env,
}) => {
  const formData = await request.formData();
  const tag = formData.get("tag") as string;
  const version = formData.get("version") as string;
  const packageName = formData.get("packageName") as string;
  const file = formData.get("file") as File;

  try {
    await env.KV.put(`wrangler:tag:${tag}:package:${packageName}`, version);
    await env.KV.put(
      `wrangler:tag:${tag}:package:${packageName}:version:${version}`,
      file.stream()
    );

    return new Response("Successfully uploaded.");
  } catch (thrown) {
    return new Response(`Could not upload package: ${thrown}.`, {
      status: 500,
    });
  }
};
