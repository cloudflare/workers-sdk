import React from "react";
import { renderToString } from "react-dom/server";

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/ssr") {
			const content = renderToString(
				React.createElement("h1", null, "Hello world")
			);

			return new Response(
				`<!DOCTYPE html>
				<html>
					<head>
						<title>React SSR</title>
					</head>
					<body>
						<div>${content}</div>
					</body>
				</html>`,
				{
					headers: { "Content-Type": "text/html" },
				}
			);
		}

		return new Response(
			`The value of process.env.NODE_ENV is "${process.env.NODE_ENV}"`
		);
	},
} satisfies ExportedHandler;
