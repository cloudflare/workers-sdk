import { rest } from "msw";
import { createFetchResult } from "../index";

export default [
	rest.get("*/zones", ({ url: { searchParams } }, res, context) => {
		return res(
			context.json(
				createFetchResult(
					searchParams.get("name") === "exists.com"
						? [
								{
									id: "exists-com",
								},
						  ]
						: []
				)
			)
		);
	}),
];
