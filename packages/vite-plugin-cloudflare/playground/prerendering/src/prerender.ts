export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/prerendered") {
			return new Response(
				`\
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Pre-rendering</title>
</head>
<body>
	<h1>Pre-rendered HTML</h1>
</body>
</html>`,
				{
					headers: { "Content-Type": "text/html" },
				}
			);
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler;
