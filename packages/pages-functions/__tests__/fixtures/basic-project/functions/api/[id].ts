export const onRequestGet = (context: { params: { id: string } }) =>
	Response.json({ id: context.params.id, method: "GET" });

export const onRequestPut = async (context: {
	params: { id: string };
	request: Request;
}) => {
	const body = await context.request.json();
	return Response.json({ id: context.params.id, method: "PUT", body });
};
