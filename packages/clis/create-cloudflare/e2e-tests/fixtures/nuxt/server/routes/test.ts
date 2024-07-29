export default eventHandler(async (event) => {
	if (!event.context.cloudflare) {
		return { success: false };
	}
	const { TEST } = event.context.cloudflare.env;

	return { value: TEST, success: true };
});
