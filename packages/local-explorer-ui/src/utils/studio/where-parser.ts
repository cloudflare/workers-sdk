/*
Recursive descent parser implementation for validating simplified SQL WHERE clauses.

This parser checks for grammatical correctness and prevents injectable expressions.
It does **not** fully support the entire SQL WHERE grammar,
but covers a practical subset for typical user needs.

⚠️ If you modify the grammar, ensure there is no left recursion.
Recursive descent parsers do not support left-recursive rules and
will enter infinite loops.

Supported grammar:

<expression> ::= <or_expr>
<or_expr> ::= <and_expr> ( "OR" <and_expr> )*
<and_expr> ::= <not_expr> ( "AND" <not_expr> )*
<not_expr> ::= [ "NOT" ] <comp_expr>
<comp_expr> ::= <arith_expr> <comp_operator> <arith_expr>
              | <arith_expr> "BETWEEN" <arith_expr> "AND" <arith_expr>
              | <arith_expr> "LIKE" <arith_expr>
              | <arith_expr> "IS" [ "NOT" ] "NULL"
              | "(" <expression> ")"

<arith_expr> ::= <term> ( ("+" | "-") <term> )*
<term> ::= <factor> ( ("*" | "/") <factor> )*
<factor> ::= [ "-" ] <primary>
<primary> ::= <literal> | <identifier> | <function_call> | "(" <arith_expr> ")"

<function_call> ::= <identifier> "(" [ <arg_list> ] ")"
<arg_list> ::= <expression> ( "," <expression> )*

<comp_operator> ::= "=" | "!=" | "<>" | "<" | ">" | "<=" | ">="
<literal> ::= <number> | <string>
<identifier> ::= [a-zA-Z_][a-zA-Z0-9_]*
<number> ::= [0-9]+ ( "." [0-9]+ )?
<string> ::= "'" [^']* "'" | '"' [^"]* '"'
*/

import type { StudioSQLToken } from "../../types/studio";

export class StudioWhereParser {
	private pos = 0;
	private tokens: StudioSQLToken[];
	private functionNames: string[];
	private identifiers: string[];

	constructor(options: {
		tokens: StudioSQLToken[];
		functionNames: string[];
		identifiers: string[];
	}) {
		this.tokens = options.tokens
			.filter((t) => t.type !== "WHITESPACE")
			.map((t) => {
				if (
					t.type === "COMMENT" ||
					t.type === "STRING" ||
					t.type === "NUMBER"
				) {
					return t;
				}

				return {
					...t,
					value: t.value.toUpperCase(),
				};
			});

		// Reserved keywords that must be escaped if used as identifiers
		const reservedKeywords = ["GROUP", "LIMIT", "ORDER", "BY"];

		for (const token of this.tokens) {
			if (reservedKeywords.includes(token.value)) {
				throw new Error(
					`"${token.value}" is a reserved SQL keyword. If you're using it as a column name, please escape it with double quotes.`
				);
			}
		}

		this.functionNames = options.functionNames.map((fn) => fn.toUpperCase());

		this.identifiers = options.identifiers
			.map((fn) => [fn.toUpperCase(), this.escapeId(fn.toUpperCase())])
			.flat();
	}

	public parse() {
		const expr = this.parseExpression();
		if (this.pos < this.tokens.length) {
			throw new Error("Invalid");
		}
		return expr;
	}

	// <expression> ::= <or_expr>
	parseExpression(): any {
		return this.parseOrExpr();
	}

	// <or_expr> ::= <and_expr> ( "OR" <and_expr> )*
	private parseOrExpr(): any {
		let node = this.parseAndExpr();
		while (this.match("OR")) {
			const right = this.parseAndExpr();
			node = { type: "or", left: node, right };
		}
		return node;
	}

	// <and_expr> ::= <not_expr> ( "AND" <not_expr> )*
	private parseAndExpr(): any {
		let node = this.parseNotExpr();
		while (this.match("AND")) {
			const right = this.parseNotExpr();
			node = { type: "and", left: node, right };
		}
		return node;
	}

	// <not_expr> ::= [ "NOT" ] <comp_expr>
	private parseNotExpr(): any {
		if (this.match("NOT")) {
			return { type: "not", expr: this.parseComparison() };
		}
		return this.parseComparison();
	}

	/**
    <comp_expr> ::= <arith_expr> <comp_operator> <arith_expr>
        | <arith_expr> "BETWEEN" <arith_expr> "AND" <arith_expr>
        | <arith_expr> "LIKE" <arith_expr>
        | <arith_expr> "IS" [ "NOT" ] "NULL"
        | "(" <expression> ")"
   */
	private parseComparison(): any {
		const left = this.parseArithmetic();

		if (this.match("BETWEEN")) {
			const low = this.parseArithmetic();
			this.expect("AND", "Expected 'AND' after 'BETWEEN'");
			const high = this.parseArithmetic();
			return { type: "between", expr: left, low, high };
		}

		if (this.match("LIKE")) {
			const pattern = this.parseArithmetic();
			return { type: "like", expr: left, pattern };
		}

		if (this.match("IS")) {
			const isNot = this.match("NOT");
			const isValue = this.expect(
				["TRUE", "FALSE", "NULL"],
				`Expected NULL, TRUE, or FALSE after IS${isNot ? " NOT" : ""}`
			);

			return {
				type: "is",
				expr: left,
				value: isValue,
				not: isNot,
			};
		}

		if (this.peek().type === "OPERATOR") {
			const op = this.consume().value;
			const right = this.parseArithmetic();
			return { type: "binary", op, left, right };
		}

		return left;
	}

	// <arith_expr> ::= <term> ( ("+" | "-") <term> )*
	private parseArithmetic(): any {
		let expr = this.parseTerm();

		while (this.match(["+", "-"])) {
			const op = this.prev().value;
			expr = {
				type: "arith",
				operator: op,
				left: expr,
				right: this.parseTerm(),
			};
		}

		return expr;
	}

	// <term> ::= <factor> ( ("*" | "/") <factor> )*
	private parseTerm(): any {
		let expr = this.parseFactor();
		while (this.match(["*", "/"])) {
			const op = this.prev().value;
			expr = {
				type: "arith",
				operator: op,
				left: expr,
				right: this.parseFactor(),
			};
		}
		return expr;
	}

	// <factor> ::= [ "-" ] <primary>
	private parseFactor(): any {
		if (this.match("-")) {
			return { type: "neg", expr: this.parsePrimary() };
		}

		return this.parsePrimary();
	}

	// <primary> ::= <literal> | <identifier> | <function_call> | "(" <arith_expr> ")"
	private parsePrimary(): any {
		const token = this.peek();

		if (this.match("(")) {
			const expr = this.parseExpression();
			this.expect(")", "Expected closing ')' to match opening '('");
			return expr;
		}

		if (token.type === "NUMBER" || token.type === "STRING") {
			return this.consume();
		}

		if (token.type === "IDENTIFIER") {
			const next = this.tokens[this.pos + 1];

			if (next && next.value === "(") {
				return this.parseFunctionCall();
			}

			if (!this.identifiers.includes(token.value)) {
				// Users often mistake double quotes (") for string literals.
				// In SQL, string literals must use single quotes (').
				// Provide a clear error message to help them avoid this confusion.
				if (token.value.startsWith('"') && token.value.endsWith('"')) {
					throw new Error(
						`${token.value} is not a valid column name in this table. It looks like you meant to use a string literal — wrap strings in single quotes (') instead of double quotes (").`
					);
				}

				throw new Error(
					`${token.value} is not a valid column name in this table.`
				);
			}

			return this.consume();
		}

		throw new Error(`Unexpected token ${token.type}`);
	}

	// <function_call> ::= <identifier> "(" [ <arg_list> ] ")"
	private parseFunctionCall(): any {
		const name = this.expect(
			this.functionNames,
			"Unsupported function name"
		).value;

		this.expect("(", "Expected '(' to start function call");

		const args: any[] = [];
		while (this.peek().value !== ")") {
			args.push(this.parseExpression());
			if (this.peek().value === ",") {
				this.consume();
			} else {
				break;
			}
		}

		this.expect(")", "Expected closing ')' to end function call");
		return { type: "call", name, args };
	}

	// Utility methods
	private prev(): StudioSQLToken {
		return this.tokens[this.pos - 1];
	}

	private escapeId(id: string): string {
		return `"${id.replace(/"/g, `""`)}"`;
	}

	private peek(): StudioSQLToken {
		return this.tokens[this.pos] ?? { type: "UNKNOWN", value: "" };
	}

	private consume(): StudioSQLToken {
		return this.tokens[this.pos++] ?? { type: "UNKNOWN", value: "" };
	}

	private expect(keywords: string[] | string, errorMessage?: string) {
		const token = this.consume();

		if (typeof keywords === "string" && keywords !== token.value) {
			throw new Error(
				errorMessage ??
					"Expecting " + keywords.toString() + " but got " + token.value
			);
		} else if (Array.isArray(keywords) && !keywords.includes(token.value)) {
			throw new Error(errorMessage ?? "Unable to parse");
		}

		return token;
	}

	private match(keywords: string | string[]) {
		const token = this.peek();

		if (typeof keywords === "string" && keywords === token.value) {
			this.consume();
			return true;
		} else if (Array.isArray(keywords) && keywords.includes(token.value)) {
			this.consume();
			return true;
		}

		return false;
	}
}
