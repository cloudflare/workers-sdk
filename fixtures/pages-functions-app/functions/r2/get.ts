type Env = {
	bucket: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
	const object = await env.bucket.get("test");
	return new Response(JSON.stringify(object));
};
