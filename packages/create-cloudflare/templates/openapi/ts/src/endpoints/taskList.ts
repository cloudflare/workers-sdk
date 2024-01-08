import { Task } from "../types";
import {
	OpenAPIRoute,
	OpenAPIRouteSchema,
	Query,
} from "@cloudflare/itty-router-openapi";

export class TaskList extends OpenAPIRoute {
	static schema: OpenAPIRouteSchema = {
		tags: ["Tasks"],
		summary: "List Tasks",
		parameters: {
			page: Query(Number, {
				description: "Page number",
				default: 0,
			}),
			isCompleted: Query(Boolean, {
				description: "Filter by completed flag",
				required: false,
			}),
		},
		responses: {
			"200": {
				description: "Returns a list of tasks",
				schema: {
					success: Boolean,
					result: {
						tasks: [Task],
					},
				},
			},
		},
	};

	async handle(
		request: Request,
		env: any,
		context: any,
		data: Record<string, any>
	) {
		// Retrieve the validated parameters
		const { page, isCompleted } = data.query;

		// Implement your own object list here

		return {
			success: true,
			tasks: [
				{
					name: "Clean my room",
					slug: "clean-room",
					description: null,
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
