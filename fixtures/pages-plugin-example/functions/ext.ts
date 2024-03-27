import isOdd from "is-odd";

export const onRequest: PagesFunction = () => {
	return new Response(`42 is ${isOdd(42) ? "odd" : "even"}`);
};
