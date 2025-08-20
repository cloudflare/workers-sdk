import React from "react";
import { renderToString } from "react-dom/server";

export default {
	async fetch() {
		const txt = renderToString(
			React.createElement("div", null, [
				React.createElement("h1", null, `Server Side React`),
				React.createElement(
					"p",
					null,
					`The value of process.env.NODE_ENV is "${process.env.NODE_ENV}"`
				),
			])
		);

		return new Response(
			`<!DOCTYPE html>
			<html>
				<head>
					<title>React Server Render</title>
				</head>
				<body>
					<div id="app">${txt}</div>
				</body>
			</html>`,
			{
				headers: { "Content-Type": "text/html" },
			}
		);
	},
};
