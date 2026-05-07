export const onRequestGet: PagesFunction = (context) => {
	const { id } = context.params;
	return Response.json({ message: `Getting item ${id}` });
};

export const onRequestPut: PagesFunction = async (context) => {
	const { id } = context.params;
	const body = await context.request.json();
	return Response.json({ message: `Updating item ${id}`, data: body });
};

export const onRequestDelete: PagesFunction = (context) => {
	const { id } = context.params;
	return Response.json({ message: `Deleted item ${id}` });
};
