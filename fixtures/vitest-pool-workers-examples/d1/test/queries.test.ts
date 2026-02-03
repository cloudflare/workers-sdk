import { env } from "cloudflare:test";
import { it } from "vitest";
import { listPosts, readPost, upsertPost } from "../src/";

it("should create and read post", async ({ expect }) => {
	await upsertPost(env, "/hello", "👋");

	const post = await readPost(env, "/hello");
	expect(post).toMatchInlineSnapshot(`
		{
		  "author": {
		    "email": "admin@example.com",
		    "name": "Ada Min",
		    "username": "admin",
		  },
		  "body": "👋",
		  "slug": "/hello",
		}
	`);
});

it("should list posts", async ({ expect }) => {
	await upsertPost(env, "/one", "1");
	await upsertPost(env, "/two", "2");
	await upsertPost(env, "/three", "3");

	const posts = await listPosts(env);
	expect(posts.length).toBe(3); // Note changes from previous test undone
	expect(posts[0].body).toBe("1");
	expect(posts[1].body).toBe("2");
	expect(posts[2].body).toBe("3");
});
