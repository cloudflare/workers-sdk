// Add data to the request and make all bodies uppercase
export const onRequest: PagesFunction<
	Env,
	never,
	Data | Record<string, never>
> = async (ctx) => {
	ctx.data = { user: "ada" };
	const response = await ctx.next();
	const text = await response.text();
	return new Response(text.toUpperCase(), response);
};
