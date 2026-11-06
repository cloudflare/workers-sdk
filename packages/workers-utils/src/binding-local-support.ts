// Leaf entry point so bundlers such as Miniflare can validate binding `remote`
// settings without pulling in the config validation surface.
export {
	getBindingLocalSupport,
	resolveBindingRemote,
	validateBindingRemoteSetting,
} from "./config/binding-local-support";
export type { BindingLocalSupport } from "./config/binding-local-support";
