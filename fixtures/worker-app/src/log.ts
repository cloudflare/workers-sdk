// Make sure built JavaScript file doesn't use the same line numbers
interface Output {
	thing: 42;
}

export function logErrors(): Output {
	console.log(new Error("logged error one"));
	console.log(new Error("logged error two").stack);
	console.log({ error: new Error("logged error three") });

	return { thing: 42 };
}
