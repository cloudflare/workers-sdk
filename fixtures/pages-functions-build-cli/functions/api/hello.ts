export const onRequestGet: PagesFunction = () => {
	return Response.json({ message: "Hello from GET /api/hello" });
};

export const onRequestPost: PagesFunction = async (context) => {
	const body = await context.request.json();
	return Response.json({
		message: "Hello from POST /api/hello",
		received: body,
	});
};
