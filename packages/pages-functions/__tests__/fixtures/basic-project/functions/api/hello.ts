export const onRequestGet = () =>
	Response.json({ message: "Hello from GET /api/hello" });

export const onRequestPost = async (context: { request: Request }) => {
	const body = await context.request.json();
	return Response.json({ message: "Hello from POST", received: body });
};
