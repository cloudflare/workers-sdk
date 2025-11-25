// Quick test to understand the _routes.json bug

const escapeRegex = (str) => {
	const ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
	return str.replace(ESCAPE_REGEX_CHARACTERS, "\\$&");
};

const generateGlobOnlyRuleRegExp = (rule) => {
	rule = rule.split("*").map(escapeRegex).join(".*");
	rule = "^" + rule + "$";
	return RegExp(rule);
};

const testRule = (rule, url) => {
	const regExp = generateGlobOnlyRuleRegExp(rule);
	const pathname = new URL(url).pathname;
	const matches = regExp.test(pathname);
	console.log(`Rule: "${rule}" → RegExp: ${regExp}`);
	console.log(`  URL: ${url}`);
	console.log(`  Pathname: "${pathname}"`);
	console.log(`  Matches: ${matches}\n`);
	return matches;
};

console.log("Testing the bug scenario:");
console.log("include: ['/*'], exclude: ['/']");
console.log("=".repeat(50));

// Test exclude rule "/"
console.log("\nExclude rule '/':");
testRule("/", "http://example.com/");
testRule("/", "http://example.com/foo");
testRule("/", "http://example.com/foo/bar");

// Test include rule "/*"
console.log("\nInclude rule '/*':");
testRule("/*", "http://example.com/");
testRule("/*", "http://example.com/foo");
testRule("/*", "http://example.com/foo/bar");
