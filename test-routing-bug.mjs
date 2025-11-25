// Test to reproduce the _routes.json bug

function transformRoutingRuleToRegExp(rule) {
	let transformedRule;

	if (rule === "/" || rule === "/*") {
		transformedRule = rule;
	} else if (rule.endsWith("/*")) {
		transformedRule = `${rule.substring(0, rule.length - 2)}(/*)?`;
	} else if (rule.endsWith("/")) {
		transformedRule = `${rule.substring(0, rule.length - 1)}(/)?`;
	} else if (rule.endsWith("*")) {
		transformedRule = rule;
	} else {
		transformedRule = `${rule}(/)?`;
	}

	transformedRule = `^${transformedRule
		.replaceAll(/\./g, "\\.")
		.replaceAll(/\*/g, ".*")}$`;

	return new RegExp(transformedRule);
}

function isRoutingRuleMatch(pathname, routingRule) {
	const ruleRegExp = transformRoutingRuleToRegExp(routingRule);
	return pathname.match(ruleRegExp) !== null;
}

function testRoute(pathname, routes) {
	console.log(`\nTesting pathname: "${pathname}"`);

	// Check exclude rules first
	for (const exclude of routes.exclude) {
		if (isRoutingRuleMatch(pathname, exclude)) {
			console.log(`  ✓ Matched exclude rule "${exclude}" → ASSETS`);
			return "ASSETS";
		}
	}

	// Then check include rules
	for (const include of routes.include) {
		if (isRoutingRuleMatch(pathname, include)) {
			console.log(`  ✓ Matched include rule "${include}" → WORKER`);
			return "WORKER";
		}
	}

	console.log(`  ✗ No rules matched → ASSETS (default)`);
	return "ASSETS";
}

// Bug scenario from issue #2046
const routes = {
	include: ["/*"],
	exclude: ["/"],
};

console.log("Testing bug scenario:");
console.log(JSON.stringify(routes, null, 2));
console.log("=".repeat(50));

// Test various pathnames
const testPaths = ["/", "/index.html", "/foo", "/foo/bar", "/api/test"];

for (const path of testPaths) {
	testRoute(path, routes);
}

console.log("\n" + "=".repeat(50));
console.log("\nExpected behavior:");
console.log('  "/" → ASSETS (excluded)');
console.log('  "/index.html" → WORKER (included)');
console.log('  "/foo" → WORKER (included)');
console.log("  All other paths → WORKER (included)");
