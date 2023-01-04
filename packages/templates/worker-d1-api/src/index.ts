import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Comment {
	author: string;
	body: string;
}
const app = new Hono();
app.use('/api/*', cors());

app.get('/api/posts/:slug/comments', async c => {
	const { slug } = c.req.param();
	const { results } = await c.env.DB.prepare(
		`
    select * from comments where post_slug = ?
  `
	)
		.bind(slug)
		.all();
	return c.json(results);
});

app.post('/api/posts/:slug/comments', async c => {
	const { slug } = c.req.param();
	const { author, body } = await c.req.json<Comment>();

	if (!author) return c.text('Missing author value for new comment');
	if (!body) return c.text('Missing body value for new comment');

	const { success } = await c.env.DB.prepare(
		`
    insert into comments (author, body, post_slug) values (?, ?, ?)
  `
	)
		.bind(author, body, slug)
		.run();

	if (success) {
		c.status(201);
		return c.text('Created');
	} else {
		c.status(500);
		return c.text('Something went wrong');
	}
});

app.onError((err, c) => {
	console.error(`${err}`);
	return c.text(err.toString());
});

app.notFound(c => c.text('Not found', 404));

export default app;
