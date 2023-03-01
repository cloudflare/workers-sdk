import index from "./index.html";

export const onRequestGet: PagesFunction = async () => {
	return new Response(index, {
		headers: {
			"Content-type": "text/html; charset=UTF-8",
			"Cache-Control": `public, s-maxage=604800`,
		},
	});
};
