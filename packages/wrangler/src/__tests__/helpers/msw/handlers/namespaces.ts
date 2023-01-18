import { rest } from "msw";
import { createFetchResult } from "../index";

export const mswSuccessNamespacesHandlers = [
	rest.post(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		(_, response, context) => {
			return response.once(
				context.json(
					createFetchResult({
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					})
				)
			);
		}
	),
	rest.delete(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response.once(context.json(createFetchResult(null)));
		}
	),
	rest.put(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response.once(
				context.json(
					createFetchResult({
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					})
				)
			);
		}
	),
	rest.get(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response.once(
				context.json(
					createFetchResult({
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					})
				)
			);
		}
	),
	rest.get(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		(_, response, context) => {
			return response.once(
				context.json(
					createFetchResult([
						{
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						},
					])
				)
			);
		}
	),
];
