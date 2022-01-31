export const onRequestDelete: PagesFunction<
  { KV: KVNamespace },
  "tag"
> = async ({ params, env }) => {
  const { tag } = params;

  const { keys } = await env.KV.list({ prefix: `wrangler:tag:${tag}` });

  if (keys.length === 0) {
    return new Response(null, { status: 404 });
  }

  const promises = [];
  for (const key of keys) {
    promises.push(env.KV.delete(key.name));
  }

  const results = await Promise.allSettled(promises);
  const success = results.every((result) => result.status === "fulfilled");

  if (success) {
    return new Response("Successfully deleted.");
  } else {
    return new Response("Could not delete every package.", { status: 500 });
  }
};
