export async function onRequest(context) {
	try {
		const reqText = await context.request.text();
		console.log(`[_MIDDLEWARE] Received: "${reqText}"`);
		return await context.next();
	} catch (err) {
		return new Response(`${err.message}\n${err.stack}`, { status: 500 });
	}
}
