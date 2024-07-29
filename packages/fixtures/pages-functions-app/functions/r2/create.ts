type Env = {
	BUCKET: R2Bucket;
};

export const onRequestPut: PagesFunction<Env> = async ({ env }) => {
	const object = await env.BUCKET.put("test", "Hello world!");
	return new Response(JSON.stringify(object));
};
