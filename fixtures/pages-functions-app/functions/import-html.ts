import html from "../static-assets/index.html";

export const onRequestGet = () => {
	return new Response(html, { headers: { "Content-Type": "text/html" } });
};
