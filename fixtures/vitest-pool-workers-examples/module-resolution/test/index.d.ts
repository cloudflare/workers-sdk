declare module "ext-dep" {
	var x: number;
	export default x;
}

// .sql files are loaded as Text modules by default in wrangler
declare module "*.sql" {
	const content: string;
	export default content;
}
