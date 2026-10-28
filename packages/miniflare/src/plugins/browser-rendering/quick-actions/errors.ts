import { Response } from "../../../http";

export function quickActionErrorResponse(error: unknown): Response {
	const raw = error instanceof Error ? error.message : String(error);
	return Response.json(
		{
			success: false,
			errors: [{ message: raw || "Internal Error", code: 2000 }],
		},
		{ status: 500 }
	);
}
