export const onRequestOptions: PagesFunction = async () => {
	return new Response(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "*",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
			"Access-Control-Max-Age": "86400",
		},
	});
};

export const onRequest: PagesFunction = async ({ request, next }) => {
	if (new URL(request.url).pathname === "/") {
		return new Response(indexPages, {
			headers: {
				"Content-type": "text/html; charset=UTF-8",
				"Cache-Control": `public, s-maxage=604800`,
			},
		});
	}
	const response = await next();
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Headers", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
	response.headers.set("Access-Control-Max-Age", "86400");
	return response;
};

const indexPages: string = `
<!doctype html>
<html>
  <head>
    <title>Pre-Release Registry</title>
		<link rel="icon" href="data:,">
  </head>
	<body>
		<h1 style="text-align: center">This Page Intentionally Left Blank</h1>
		<p style="text-align: center">This site is only used for pre-releases of <a href="https://github.com/cloudflare/workers-sdk">Workers-SDK</a>. You should check it out!</p>
	</body>
</html>
`;
