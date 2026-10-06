export const onRequestGet: PagesFunction<Env, "key", Data> = async (ctx) => {
	const key = `${ctx.data.user}:${ctx.params.key}`;
	const value = await ctx.env.KV_NAMESPACE.get(key, "stream");
	return new Response(value, { status: value === null ? 204 : 200 });
};

export const onRequestPut: PagesFunction<Env, "key", Data> = async (ctx) => {
	const key = `${ctx.data.user}:${ctx.params.key}`;
	await ctx.env.KV_NAMESPACE.put(key, ctx.request.body ?? "");
	return new Response(null, { status: 204 });
};
