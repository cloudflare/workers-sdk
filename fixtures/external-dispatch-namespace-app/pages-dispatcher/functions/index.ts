export const onRequest = async ({ env, request }) => {
	const customerScript = env.MY_DISPATCH_NAMESPACE.get(
		"customer-script",
		{},
		{
			outbound: {
				parameter1: "p1",
				parameter2: "p2",
			},
		}
	);
	return customerScript.fetch(request);
};
