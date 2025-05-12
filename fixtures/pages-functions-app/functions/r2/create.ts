type Env = {
	bucket: R2Bucket;
};

export const onRequestPut: PagesFunction<Env> = async ({ env }) => {
	const object = await env.bucket.put("test", "Hello world!");
	return new Response(JSON.stringify(object));
};
