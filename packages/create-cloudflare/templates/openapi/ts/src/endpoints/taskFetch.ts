import { NotFoundException, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types";

export class TaskFetch extends OpenAPIRoute {
	schema = {
		tags: ["Tasks"],
		summary: "Get a single Task by slug",
		request: {
			params: z.object({
				taskSlug: z.string().describe("Task slug"),
			}),
		},
		responses: {
			"200": {
				description: "Returns a single task if found",
				content: {
					"application/json": {
						schema: z.object({
							success: z.boolean(),
							task: Task,
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		// Get validated data
		const data = await this.getValidatedData<typeof this.schema>();

		// Retrieve the validated slug
		const { taskSlug } = data.params;

		// Implement your own object fetch here

		const exists = true;

		if (!exists) {
			throw new NotFoundException();
		}

		return {
			success: true,
			task: {
				name: "my task",
				slug: taskSlug,
				description: "this needs to be done",
				completed: false,
				due_date: new Date().toISOString().slice(0, 10),
			},
		};
	}
}
