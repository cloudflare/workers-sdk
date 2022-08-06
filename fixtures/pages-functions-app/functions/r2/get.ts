type Env = {
	BUCKET: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
	const object = await env.BUCKET.get("test");
	return new Response(JSON.stringify(object));
};
