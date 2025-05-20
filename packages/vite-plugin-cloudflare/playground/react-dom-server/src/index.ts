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
					"This page was server side rendered by using directly 'renderToString' from 'react-dom/server'"
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
