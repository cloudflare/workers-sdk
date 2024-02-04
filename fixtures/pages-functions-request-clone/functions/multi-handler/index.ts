export async function onRequestPost({ request }: { request: Request }) {
	const reqText = await request.text();
	return new Response(`[POST] Received: "${reqText}"`);
}
