// Emulated Ratelimit Binding

// ENV configuration
interface SecretStoreEnv {
	storeId: string;
	name: string;
}

class SecretStore {
	env: SecretStoreEnv;

	constructor(env: SecretStoreEnv) {
		this.env = env;
	}

	async get(): Promise<string> {
		return this.env.name;
	}
}

// create a new SecretStore
export default function (env: SecretStoreEnv) {
	return new SecretStore(env);
}
