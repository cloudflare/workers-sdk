import { http, HttpResponse } from "msw";

import { createFetchResult } from "../index";

export const mswSuccessNamespacesHandlers = [
	http.post(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		() => {
			return HttpResponse.json(
				createFetchResult({
					namespace_id: "some-namespace-id",
					namespace_name: "namespace-name",
					created_on: "2022-06-29T14:30:08.16152Z",
					created_by: "1fc1df98cc4420fe00367c3ab68c1639",
					modified_on: "2022-06-29T14:30:08.16152Z",
					modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
				})
			);
		},
		{ once: true }
	),
	http.delete(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		() => {
			return HttpResponse.json(createFetchResult(null));
		},
		{ once: true }
	),
	http.put(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		() => {
			return HttpResponse.json(
				createFetchResult({
					namespace_id: "some-namespace-id",
					namespace_name: "namespace-name",
					created_on: "2022-06-29T14:30:08.16152Z",
					created_by: "1fc1df98cc4420fe00367c3ab68c1639",
					modified_on: "2022-06-29T14:30:08.16152Z",
					modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
				})
			);
		},
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		() => {
			return HttpResponse.json(
				createFetchResult({
					namespace_id: "some-namespace-id",
					namespace_name: "namespace-name",
					created_on: "2022-06-29T14:30:08.16152Z",
					created_by: "1fc1df98cc4420fe00367c3ab68c1639",
					modified_on: "2022-06-29T14:30:08.16152Z",
					modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
				})
			);
		},
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		() => {
			return HttpResponse.json(
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
			);
		},
		{ once: true }
	),
];
