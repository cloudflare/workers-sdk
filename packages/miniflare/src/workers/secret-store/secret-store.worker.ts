// Emulated Secret Store Binding

// ENV configuration
interface SecretStoreEnv {
	store: KVNamespace<string>;
	name: string;
}

class SecretStore {
	name: string;
	store: KVNamespace<string>;

	constructor(env: SecretStoreEnv) {
		this.name = env.name;
		this.store = env.store;
	}

	async get(): Promise<string> {
		const value = await this.store.get(this.name, "text");

		if (value === null) {
			throw new Error(`Secret ${this.name} not found`);
		}

		return value;
	}
}

// create a new SecretStore
export default function (env: SecretStoreEnv) {
	return new SecretStore(env);
}
