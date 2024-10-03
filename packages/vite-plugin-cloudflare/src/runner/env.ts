export interface WrapperEnv {
	__VITE_ROOT__: string;
	__VITE_ENTRY_PATH__: string;
	__VITE_FETCH_MODULE__: {
		fetch: (request: Request) => Promise<Response>;
	};
	__VITE_UNSAFE_EVAL__: {
		eval: (code: string, filename: string) => Function;
	};
}
