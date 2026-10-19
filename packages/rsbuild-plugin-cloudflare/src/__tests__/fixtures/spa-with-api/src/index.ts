void fetch("/api/hello")
	.then((response) => response.json() as Promise<{ name: string }>)
	.then(({ name }) => {
		document.body.textContent = `Hello, ${name}!`;
	});
