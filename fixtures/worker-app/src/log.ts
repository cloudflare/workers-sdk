// Make sure built JavaScript file doesn't use the same line numbers
interface Output {
	thing: 42;
}

export function logErrors(): Output {
	console.log(new Error("logged error one"));
	console.log(new Error("logged error two").stack);
	console.log({ error: new Error("logged error three") });
	console.log({ nested: { error: new Error("logged error four").stack } });

	console.log("some normal text to log");
	console.log("text with at in the middle");
	console.log("more text with    at in the middle");

	return { thing: 42 };
}
