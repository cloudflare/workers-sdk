import { rest } from "msw";

export const mswUserHandlers = [
	rest.get("*/user", (_, res, cxt) => {
		return res(
			cxt.status(200),
			cxt.json({
				success: true,
				errors: [],
				messages: [],
				result: {
					id: "7c5dae5552338874e5053f2534d2767a",
					email: "user@example.com",
					first_name: "John",
					last_name: "Appleseed",
					username: "cfuser12345",
					telephone: "+1 123-123-1234",
					country: "US",
					zipcode: "12345",
					created_on: "2014-01-01T05:20:00Z",
					modified_on: "2014-01-01T05:20:00Z",
					two_factor_authentication_enabled: false,
					suspended: false,
				},
			})
		);
	}),
	rest.get("*/accounts", (_, res, cxt) => {
		return res(
			cxt.status(200),
			cxt.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{ name: "Account One", id: "account-1" },
					{ name: "Account Two", id: "account-2" },
					{ name: "Account Three", id: "account-3" },
				],
			})
		);
	}),
	rest.post(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		(request, response, context) => {
			return response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					},
				})
			);
		}
	),
	rest.delete(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: null,
				})
			);
		}
	),
	rest.put(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					},
				})
			);
		}
	),
	rest.get(
		"*/accounts/:accountId/workers/dispatch/namespaces/:namespaceName",
		(_, response, context) => {
			return response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						namespace_id: "some-namespace-id",
						namespace_name: "namespace-name",
						created_on: "2022-06-29T14:30:08.16152Z",
						created_by: "1fc1df98cc4420fe00367c3ab68c1639",
						modified_on: "2022-06-29T14:30:08.16152Z",
						modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
					},
				})
			);
		}
	),
	rest.get(
		"*/accounts/:accountId/workers/dispatch/namespaces",
		(_, response, context) => {
			return response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						{
							namespace_id: "some-namespace-id",
							namespace_name: "namespace-name",
							created_on: "2022-06-29T14:30:08.16152Z",
							created_by: "1fc1df98cc4420fe00367c3ab68c1639",
							modified_on: "2022-06-29T14:30:08.16152Z",
							modified_by: "1fc1df98cc4420fe00367c3ab68c1639",
						},
					],
				})
			);
		}
	),
	rest.get("*/memberships", (_, response, context) => {
		return response(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						id: "membership-id-1",
						account: { id: "account-id-1", name: "My Personal Account" },
					},
					{
						id: "membership-id-2",
						account: { id: "account-id-2", name: "Enterprise Account" },
					},
				],
			})
		);
	}),
];
