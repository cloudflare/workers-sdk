interface InternalEnv {
	MODERATOR: Workflow<
		Parameters<import("./index").ModeratorWorkflow["run"]>[0]["payload"]
	>;
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./index");
	}
	interface Env extends InternalEnv {}
}
interface Env extends InternalEnv {}
