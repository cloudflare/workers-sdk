// @ts-ignore - it gets bundled by wrangler
import index from "./index.html";
import { Hono } from "hono";
import { scheduled } from "./functions";
import { DBNotifier, DBSitemap, DBUrl } from "./types";

const h = new Hono();

h.get("/_scheduled", async (c) => {
	try {
		await scheduled({
			authToken: c.env.AUTH_TOKEN,
			db: c.env.DB,
			queue: c.env.QUEUE,
			sitemapUrl: c.env.SITEMAP_URL,
		});
	} catch (err: any) {
		console.error(`Error in scheduled function: ${err.message}`);
	}

	return c.redirect("/");
});

h.get("/config", async (c) => {
	return c.json({
		AUTH_TOKEN: c.env.AUTH_TOKEN,
		BASE_SITEMAP: c.env.SITEMAP_URL,
	});
});

h.get("/scheduled", async (c) => {
	const notifierQuery = await c.env.DB.prepare("select * from notifiers").all();
	const notifiers: Array<DBNotifier> = notifierQuery.results;

	if (!notifiers.length) {
		return c.html(
			`<p class="onboarding">Add a notifier to begin using this application.</p>`
		);
	}

	const sitemapQuery = await c.env.DB.prepare("select * from sitemaps").all();
	const sitemaps: Array<DBSitemap> = sitemapQuery.results;

	if (sitemaps.length) {
		return c.html("");
	} else {
		return c.html(`
      <p class="onboarding">
        If you've just set up the application, you can <a href="/_scheduled">click here to initialize</a> immediately, instead of
        waiting for the scheduled function to run.
      </p>
    `);
	}
});

h.get("/notifiers", async (c) => {
	const query = await c.env.DB.prepare("select * from notifiers").all();
	const notifiers: Array<DBNotifier> = query.results;
	const html = notifiers
		.map(
			(notifier) => `
    <tr>
      <td>${notifier.keyword}</td>
      <td>${notifier.email}</td>
      <td>
        <button
          hx-delete="/notifiers/${notifier.id}"
          hx-confirm="Are you sure?"
        >
          Delete
        </button>
      </td>
    </tr>
  `
		)
		.join("\n");

	return c.html(html);
});

h.post("/notifiers", async (c) => {
	try {
		const { keyword, email } = await c.req.parseBody();
		await c.env.DB.prepare(
			"insert into notifiers (keyword, email) values (?, ?)"
		)
			.bind(keyword, email)
			.run();
		return c.redirect("/");
	} catch (err) {
		c.status(500);
		return c.text("Something went wrong");
	}
});

h.delete("/notifiers/:id", async (c) => {
	try {
		const { id } = c.req.param();
		await c.env.DB.prepare("delete from notifiers where id = ?").bind(id).run();
		c.status(204);
		c.header("HX-Refresh", "true");
		return c.text("OK");
	} catch (err) {
		c.status(500);
		return c.text("Something went wrong");
	}
});

h.get("/urls", async (c) => {
	const query = await c.env.DB.prepare(`select * from urls`).all();
	const notifiers: Array<DBUrl> = query.results;
	const html = notifiers
		.map(
			({ url, last_checked }) => `
    <tr>
      <td>${url}</td>
      <td>${
				last_checked ? new Date(last_checked).toLocaleString() : "never"
			}</td>
    </tr>
  `
		)
		.join("\n");

	return c.html(html);
});

h.get("/sitemaps", async (c) => {
	const query = await c.env.DB.prepare("select * from sitemaps").all();
	const sitemaps: Array<DBSitemap> = query.results;
	const html = sitemaps
		.map(
			({ url }) => `
    <tr>
      <td>${url}</td>
    </tr>
  `
		)
		.join("\n");
	return c.html(html);
});

h.get("/", (c) => {
	return c.html(index);
});

export default h;
