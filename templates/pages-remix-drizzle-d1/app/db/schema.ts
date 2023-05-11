import {
	sqliteTable,
	text,
	integer,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const articles = sqliteTable(
	"articles",
	{
		slug: text("slug").primaryKey().notNull(),
		title: text("title"),
		excerpt: text("excerpt"),
		content: text("content"),
		author: text("author"),
		published_on: integer("published_on", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }),
	},
	(articles) => ({
		slugIdx: uniqueIndex("slugIdx").on(articles.slug),
		nameIdx: uniqueIndex("nameIdx").on(articles.title),
	})
);
