import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import invariant from "tiny-invariant";
import { eq } from "drizzle-orm";

import type { LoaderFunction } from "@remix-run/cloudflare";
import type { InferModel } from "drizzle-orm";

import { Markdown } from "~/components/Markdown";
import { client } from "~/db/client.server";
import { articles } from "~/db/schema";

export type Article = InferModel<typeof articles>; // return type when queried

export const loader: LoaderFunction = async ({ context, params }) => {
	invariant(params.slug, "slug not provided!");

	const article = await client(context.DB)
		.select()
		.from(articles)
		.where(eq(articles.slug, params.slug))
		.get();

	if (!article) {
		throw new Response("Not Found", {
			status: 404,
		});
	}

	return json({ article });
};
type LoaderType = Awaited<ReturnType<typeof loader>>;

const Article = () => {
	const data = useLoaderData<LoaderType>();

	const { article } = data;
	console.log("data", data);

	return (
		<>
			{article ? (
				<main>
					<h1>{article.title}</h1>
					<p>
						Published: {new Date(article.published_on).toLocaleDateString()}
					</p>
					<Markdown content={data.article.content} />
				</main>
			) : (
				<div>
					<h1>No results</h1>
				</div>
			)}
		</>
	);
};

export default Article;
