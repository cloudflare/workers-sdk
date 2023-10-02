import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { TaskList } from "./endpoints/taskList";
import { TaskCreate } from "./endpoints/taskCreate";
import { TaskFetch } from "./endpoints/taskFetch";
import { TaskDelete } from "./endpoints/taskDelete";

export const router = OpenAPIRouter({
	docs_url: "/",
});

router.get("/api/tasks/", TaskList);
router.post("/api/tasks/", TaskCreate);
router.get("/api/tasks/:taskSlug/", TaskFetch);
router.delete("/api/tasks/:taskSlug/", TaskDelete);

// 404 for everything else
router.all("*", () =>
	Response.json(
		{
			success: false,
			error: "Route not found",
		},
		{ status: 404 }
	)
);

export default {
	fetch: router.handle,
};
