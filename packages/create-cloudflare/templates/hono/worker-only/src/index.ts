import { Hono } from 'hono'

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (ctx) => ctx.text("Hello world, this is Hono!!"));

export default app