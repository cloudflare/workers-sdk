export const onRequest = async (context) => {
	context.data = "foo-bar";
	return await context.next();
};
