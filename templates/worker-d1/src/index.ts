import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { html } from 'hono/html';

type Bindings = {
	DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

app.get('/', async c => {
	const tables = await c.env.DB.prepare(
		`SELECT name
		FROM sqlite_schema
		WHERE type = 'table'
			AND name NOT LIKE 'sqlite_%'
			AND name NOT LIKE '_cf_%'
			AND name NOT LIKE 'd1_%'
		ORDER BY name ASC;`
	).all();

	return c.html(
		html`<!doctype html>
			<html>
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>D1 Worker</title>
					<link
						rel="stylesheet"
						href="https://cdnjs.cloudflare.com/ajax/libs/mini.css/3.0.1/mini-default.min.css"
					/>
				</head>
				<body style="padding: 1em 2em">
					${tables.results.map(
						row =>
							html`<div>
								<a href="${new URL(`/api/${row.name}`, c.req.url)}">${row.name}</a>
							</div>`
					)}
				</body>
			</html>`
	);
});

app.get('/api/Category', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Category]`).all();
	return c.json(resp.results);
});

app.get('/api/Customer', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Customer]`).all();
	return c.json(resp.results);
});

app.get('/api/customercustomerDemo', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [CustomerCustomerDemo]`).all();
	return c.json(resp.results);
});

app.get('/api/CustomerDemographic', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [CustomerDemographic]`).all();
	return c.json(resp.results);
});

app.get('/api/Employee', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Employee]`).all();
	return c.json(resp.results);
});

app.get('/api/EmployeeTerritory', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [EmployeeTerritory]`).all();
	return c.json(resp.results);
});

app.get('/api/Order', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Order]`).all();
	return c.json(resp.results);
});

app.get('/api/OrderDetail', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [OrderDetail]`).all();
	return c.json(resp.results);
});

app.get('/api/Product', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Product]`).all();
	return c.json(resp.results);
});

app.get('/api/Region', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Region]`).all();
	return c.json(resp.results);
});

app.get('/api/Shipper', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Shipper]`).all();
	return c.json(resp.results);
});

app.get('/api/Supplier', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Supplier]`).all();
	return c.json(resp.results);
});

app.get('/api/Territory', async c => {
	const resp = await c.env.DB.prepare(`SELECT * FROM [Territory]`).all();
	return c.json(resp.results);
});

app.onError((err, c) => {
	console.error(`${err}`);
	return c.text(err.toString());
});

app.notFound(c => c.text('Not found', 404));

export default app;
