export const onRequestGet = () => {
	return Response.json({ message: "Hello from GET /api/hello" });
};

export const onRequestPost = async (context) => {
	const body = await context.request.json();
	return Response.json({
		message: "Hello from POST /api/hello",
		received: body,
	});
};
