export const onRequest = [
	async (context) => {
		context.data = { foo: "bar" };
		return await context.next();
	},
	async (context) => {
		context.data = { bar: "baz" };
		return await context.next();
	},
	async (context) => {
		return Response.json(context.data);
	},
];
