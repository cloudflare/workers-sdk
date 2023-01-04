import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { TaskCreate, TaskDelete, TaskFetch, TaskList } from "./tasks";

const router = OpenAPIRouter({
	schema: {
		info: {
			title: "Worker OpenAPI Example",
			version: "1.0",
		},
	},
});

router.get("/api/tasks/", TaskList);
router.post("/api/tasks/", TaskCreate);
router.get("/api/tasks/:taskSlug/", TaskFetch);
router.delete("/api/tasks/:taskSlug/", TaskDelete);

// Redirect root request to the /docs page
router.original.get("/", (request) =>
	Response.redirect(`${request.url}docs`, 302)
);

// 404 for everything else
router.all("*", () => new Response("Not Found.", { status: 404 }));

export default {
	fetch: router.handle,
};
