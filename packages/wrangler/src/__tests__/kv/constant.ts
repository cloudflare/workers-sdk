export const wranglerKVConfig = {
	name: "other-worker",
	kv_namespaces: [
		{
			binding: "someBinding",
			id: "bound-id",
			preview_id: "preview-bound-id",
		},
	],
	env: {
		"some-environment": {
			kv_namespaces: [
				{
					binding: "someBinding",
					id: "env-bound-id",
					preview_id: "preview-env-bound-id",
				},
			],
		},
	},
};
