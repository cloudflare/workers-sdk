import {
	Bool,
	DateOnly,
	Int,
	OpenAPIRoute,
	Path,
	Query,
	Str,
} from "@cloudflare/itty-router-openapi";

const Task = {
	name: new Str({ example: "lorem" }),
	slug: String,
	description: new Str({ required: false }),
	completed: Boolean,
	due_date: new DateOnly(),
};

export class TaskFetch extends OpenAPIRoute {
	static schema = {
		tags: ["Tasks"],
		summary: "Get a single Task by slug",
		parameters: {
			taskSlug: Path(Str, {
				description: "Task slug",
			}),
		},
		responses: {
			"200": {
				schema: {
					metaData: {},
					task: Task,
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
		// Retrieve the validated slug
		const { taskSlug } = data;

		// Actually fetch a task using the taskSlug

		return {
			metaData: { meta: "data" },
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

export class TaskCreate extends OpenAPIRoute {
	static schema = {
		tags: ["Tasks"],
		summary: "Create a new Task",
		requestBody: Task,
		responses: {
			"200": {
				schema: {
					task: Task,
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
		// Retrieve the validated request body
		const { body } = data;

		// Actually insert the task

		// return the new task
		return {
			metaData: { meta: "data" },
			task: {
				name: body.name,
				slug: body.slug,
				description: body.description,
				completed: body.completed,
				due_date: body.due_date,
			},
		};
	}
}

export class TaskList extends OpenAPIRoute {
	static schema = {
		tags: ["Tasks"],
		summary: "List Tasks",
		parameters: {
			page: Query(Int, {
				description: "Page number",
				default: 0,
			}),
			isCompleted: Query(Bool, {
				description: "Filter by completed flag",
				required: false,
			}),
		},
		responses: {
			"200": {
				schema: {
					tasks: [Task],
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
		const { page, isCompleted } = data;

		return {
			metaData: { page: page, isCompleted: isCompleted },
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

export class TaskDelete extends OpenAPIRoute {
	static schema = {
		tags: ["Tasks"],
		summary: "Delete a Task",
		parameters: {
			taskSlug: Path(Str, {
				description: "Task slug",
			}),
		},
		responses: {
			"200": {
				schema: {
					metaData: {},
					success: Boolean,
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
		// Retrieve the validated slug
		const { taskSlug } = data;

		return {
			metaData: { taskSlug: taskSlug },
			success: true,
		};
	}
}
