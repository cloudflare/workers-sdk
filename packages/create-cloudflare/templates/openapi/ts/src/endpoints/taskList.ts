import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types";

export class TaskList extends OpenAPIRoute {
	schema = {
		tags: ["Tasks"],
		summary: "List Tasks",
		request: {
			query: z.object({
				page: z.number().default(0).describe("Page number"),
				isCompleted: z
					.boolean()
					.optional()
					.describe("Filter by completed flag"),
			}),
		},
		responses: {
			"200": {
				description: "Returns a list of tasks",
				content: {
					"application/json": {
						schema: z.object({
							success: z.boolean(),
							tasks: Task.array(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		// Get validated data
		const data = await this.getValidatedData<typeof this.schema>();

		// Retrieve the validated parameters
		const { page, isCompleted } = data.query;

		// Implement your own object list here

		return {
			success: true,
			tasks: [
				{
					name: "Clean my room",
					slug: "clean-room",
					description: undefined,
					completed: false,
					due_date: "2025-01-05",
				},
				{
					name: "Build something awesome with Cloudflare Workers",
					slug: "cloudflare-workers",
					description: "Lorem Ipsum",
					completed: true,
					due_date: "2022-12-24",
				},
			],
		};
	}
}
