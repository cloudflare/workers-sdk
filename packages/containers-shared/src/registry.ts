import Docker from "dockerode";

export async function dockerLoginManagedRegistry(options: {
	generateCredentials: (domain: string, options: { expiration_minutes: number; permissions: string[] }) => Promise<{ password: string }>;
}) {
	const docker = new Docker();
	const domain = "registry.cloudchamber.cfdata.org";
	const expirationMinutes = 15;

	const credentials = await options.generateCredentials(domain, {
		expiration_minutes: expirationMinutes,
		permissions: ["push"],
	});

	// Use dockerode's auth method
	await docker.checkAuth({
		username: "v1",
		password: credentials.password,
		serveraddress: domain,
	});

	// Store auth in docker config for subsequent operations
	const authconfig = {
		username: "v1",
		password: credentials.password,
		serveraddress: domain,
	};

	// Set the auth for this docker instance
	(docker as any).modem.authconfig = authconfig;

	return authconfig;
}