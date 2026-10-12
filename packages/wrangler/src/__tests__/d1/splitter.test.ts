import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";
import {
	mayContainMultipleStatements,
	normalizeSqlLineEndings,
	splitSqlQuery,
} from "../../d1/splitter";

describe("normalizeSqlLineEndings()", () => {
	it("should preserve CRLF inside quoted SQL values and identifiers", ({
		expect,
	}) => {
		const sql =
			"SELECT 'single''quote\r\nvalue', \"double\r\nquote\", `backtick\r\nquote`, [bracket\r\nquote]; -- don't stop scanning\r\n/* block\r\ncomment */\r\nSELECT 1;";

		expect(normalizeSqlLineEndings(sql)).toBe(
			"SELECT 'single''quote\r\nvalue', \"double\r\nquote\", `backtick\r\nquote`, [bracket\r\nquote]; -- don't stop scanning\n/* block\ncomment */\nSELECT 1;"
		);
	});
});

describe("mayContainMultipleStatements()", () => {
	it("should return false if there is only a semi-colon at the end", ({
		expect,
	}) => {
		expect(mayContainMultipleStatements(`SELECT * FROM my_table`)).toBe(false);
		expect(
			mayContainMultipleStatements(`SELECT * FROM my_table WHERE id = 42;`)
		).toBe(false);
		expect(
			mayContainMultipleStatements(`SELECT * FROM my_table WHERE id = 42;   `)
		).toBe(false);
	});

	it("should return true if there is a semi-colon before the end of the string", ({
		expect,
	}) => {
		expect(
			mayContainMultipleStatements(
				`SELECT * FROM my_table WHERE val = "foo;bar";`
			)
		).toBe(true);
	});

	it("should return true if there is more than one statement", ({ expect }) => {
		expect(
			mayContainMultipleStatements(
				`
      INSERT INTO my_table (id, value) VALUES (42, 'foo');
      SELECT * FROM my_table WHERE id = 42;
    `
			)
		).toBe(true);
	});
});

describe("splitSqlQuery()", () => {
	it("should trim a regular old sqlite dump", ({ expect }) => {
		expect(
			splitSqlQuery(`PRAGMA foreign_keys=OFF;
		BEGIN TRANSACTION;
		CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'));
		INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders');
		INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy');
		INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth');
		INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name');
		COMMIT;`)
		).toMatchInlineSnapshot(`
			[
			  "PRAGMA foreign_keys=OFF",
			  "CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
			  "CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'))",
			  "INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders')",
			  "INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy')",
			  "INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth')",
			  "INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name')",
			]
		`);
	});
	it("should return original SQL if there are no real statements", ({
		expect,
	}) => {
		expect(splitSqlQuery(`;;;`)).toMatchInlineSnapshot(`
			[
			  ";;;",
			]
		`);
	});

	it("should not split single statements", ({ expect }) => {
		expect(splitSqlQuery(`SELECT * FROM my_table`)).toMatchInlineSnapshot(`
			[
			  "SELECT * FROM my_table",
			]
		`);
		expect(splitSqlQuery(`SELECT * FROM my_table WHERE id = 42;`))
			.toMatchInlineSnapshot(`
				[
				  "SELECT * FROM my_table WHERE id = 42;",
				]
			`);
		expect(
			splitSqlQuery(
				`
      SELECT * FROM my_table WHERE id = 42;
    `
			)
		).toMatchInlineSnapshot(`
			[
			  "
			      SELECT * FROM my_table WHERE id = 42;
			    ",
			]
		`);
	});

	it("should handle strings", ({ expect }) => {
		expect(
			splitSqlQuery(
				`
      SELECT * FROM my_table WHERE val = "foo;bar";
    `
			)
		).toMatchInlineSnapshot(`
			[
			  "SELECT * FROM my_table WHERE val = "foo;bar"",
			]
		`);
	});

	it("should handle inline comments", ({ expect }) => {
		expect(
			splitSqlQuery(
				`SELECT * FROM my_table -- semicolons; in; comments; don't count;
        WHERE val = 'foo;bar'
        AND "col;name" = \`other;col\`; -- or identifiers (Postgres or MySQL style)`
			)
		).toMatchInlineSnapshot(`
			[
			  "SELECT * FROM my_table -- semicolons; in; comments; don't count;
			        WHERE val = 'foo;bar'
			        AND "col;name" = \`other;col\`",
			]
		`);
	});

	it("should handle block comments", ({ expect }) => {
		expect(
			splitSqlQuery(
				`/****
        * Block comments are ignored;
        ****/
			SELECT * FROM my_table /* semicolons; in; comments; don't count; */
        WHERE val = 'foo;bar' AND count / 2 > 0`
			)
		).toMatchInlineSnapshot(`
			[
			  "/****
			        * Block comments are ignored;
			        ****/
						SELECT * FROM my_table /* semicolons; in; comments; don't count; */
			        WHERE val = 'foo;bar' AND count / 2 > 0",
			]
		`);
	});

	it("should split multiple statements", ({ expect }) => {
		expect(
			splitSqlQuery(
				`
        INSERT INTO my_table (id, value) VALUES (42, 'foo');
        SELECT * FROM my_table WHERE id = 42 - 10;
      `
			)
		).toMatchInlineSnapshot(`
			[
			  "INSERT INTO my_table (id, value) VALUES (42, 'foo')",
			  "SELECT * FROM my_table WHERE id = 42 - 10",
			]
		`);
	});

	it("should ignore comment at the end", ({ expect }) => {
		expect(
			splitSqlQuery(
				`
		-- This is a comment
        SELECT * FROM my_table WHERE id = 42 - 10;
		-- This is a comment
      `
			)
		).toMatchInlineSnapshot(`
			[
			  "-- This is a comment
			        SELECT * FROM my_table WHERE id = 42 - 10",
			]
		`);
	});

	it("should handle whitespace between statements", ({ expect }) => {
		expect(
			splitSqlQuery(`
        CREATE DOMAIN custom_types.email AS TEXT CHECK (VALUE ~ '^.+@.+$');
        CREATE TYPE custom_types.currency AS ENUM('USD', 'GBP');

        CREATE TYPE custom_types.money_with_currency AS (
          value NUMERIC(1000, 2),
          currency custom_types.currency,
          description TEXT
        );
        CREATE TYPE custom_types.balance_pair AS (
          income custom_types.money_with_currency,
          expenditure custom_types.money_with_currency
        );

        CREATE TABLE custom_types.accounts (
          email custom_types.email NOT NULL PRIMARY KEY,
          balance custom_types.money_with_currency
        );
        CREATE TABLE custom_types.balance_pairs (
          balance custom_types.balance_pair
        );
      `)
		).toMatchInlineSnapshot(`
			[
			  "CREATE DOMAIN custom_types.email AS TEXT CHECK (VALUE ~ '^.+@.+$')",
			  "CREATE TYPE custom_types.currency AS ENUM('USD', 'GBP')",
			  "CREATE TYPE custom_types.money_with_currency AS (
			          value NUMERIC(1000, 2),
			          currency custom_types.currency,
			          description TEXT
			        )",
			  "CREATE TYPE custom_types.balance_pair AS (
			          income custom_types.money_with_currency,
			          expenditure custom_types.money_with_currency
			        )",
			  "CREATE TABLE custom_types.accounts (
			          email custom_types.email NOT NULL PRIMARY KEY,
			          balance custom_types.money_with_currency
			        )",
			  "CREATE TABLE custom_types.balance_pairs (
			          balance custom_types.balance_pair
			        )",
			]
		`);
	});

	it("uses SQLite rather than PostgreSQL dollar quote syntax", ({ expect }) => {
		expect(splitSqlQuery("SELECT $tag$one; two$tag$; SELECT 2;")).toEqual([
			"SELECT $tag$one",
			"two$tag$",
			"SELECT 2",
		]);
	});

	it("matches SQLite statement boundaries", ({ expect }) => {
		expect(
			splitSqlQuery("EXPLAIN SELECT 1; CREATE TEMP TABLE items (id);")
		).toEqual(["EXPLAIN SELECT 1", "CREATE TEMP TABLE items (id)"]);

		expect(
			splitSqlQuery(
				`EXPLAIN CREATE TEMP TRIGGER trigger_one AFTER INSERT ON items BEGIN SELECT CASE WHEN 1 THEN 'value;still quoted' END; END; CREATE TABLE after_trigger ([identifier;] TEXT);`
			)
		).toEqual([
			"EXPLAIN CREATE TEMP TRIGGER trigger_one AFTER INSERT ON items BEGIN SELECT CASE WHEN 1 THEN 'value;still quoted' END; END",
			"CREATE TABLE after_trigger ([identifier;] TEXT)",
		]);

		expect(
			splitSqlQuery(
				"EXPLAIN CREATE TEMPORARY TRIGGER trigger_two AFTER INSERT ON items BEGIN SELECT 1; END; SELECT 2;"
			)
		).toEqual([
			"EXPLAIN CREATE TEMPORARY TRIGGER trigger_two AFTER INSERT ON items BEGIN SELECT 1; END",
			"SELECT 2",
		]);
	});

	it("splits trigger fixtures from SQLite", ({ expect }) => {
		// https://github.com/sqlite/sqlite/blob/version-3.44.2/test/trigger1.test
		expect(
			splitSqlQuery(
				"CREATE TRIGGER 'trigger' AFTER INSERT ON t2 BEGIN SELECT 1; END; SELECT name FROM sqlite_master WHERE type='trigger';"
			)
		).toEqual([
			"CREATE TRIGGER 'trigger' AFTER INSERT ON t2 BEGIN SELECT 1; END",
			"SELECT name FROM sqlite_master WHERE type='trigger'",
		]);

		// https://github.com/sqlite/sqlite/blob/version-3.44.2/test/temptrigger.test
		expect(
			splitSqlQuery(
				"CREATE TEMP TRIGGER tr1 AFTER INSERT ON t1 BEGIN INSERT INTO tt1 VALUES(new.a, new.b); END;"
			)
		).toEqual([
			"CREATE TEMP TRIGGER tr1 AFTER INSERT ON t1 BEGIN INSERT INTO tt1 VALUES(new.a, new.b); END",
		]);
	});

	it("drops only statement fragments containing no useful SQL token", ({
		expect,
	}) => {
		expect(splitSqlQuery("SELECT 1; -- trailing comment")).toEqual([
			"SELECT 1",
		]);
		expect(splitSqlQuery(";;; /* comment */")).toEqual([";;; /* comment */"]);
	});

	it("does not classify keyword-looking or quoted identifiers as keywords", ({
		expect,
	}) => {
		expect(
			splitSqlQuery(
				`CREATE TABLE create_trigger (endless TEXT, "END" TEXT); SELECT 'create; trigger', "end;", \`trigger;\`;`
			)
		).toEqual([
			'CREATE TABLE create_trigger (endless TEXT, "END" TEXT)',
			"SELECT 'create; trigger', \"end;\", `trigger;`",
		]);
	});

	it("preserves an unterminated bracket identifier after a complete statement", ({
		expect,
	}) => {
		expect(splitSqlQuery("SELECT 1; [unterminated")).toEqual([
			"SELECT 1",
			"[unterminated",
		]);
	});

	it("preserves an unterminated quoted value after a complete statement", ({
		expect,
	}) => {
		expect(splitSqlQuery("SELECT 1; 'unterminated")).toEqual([
			"SELECT 1",
			"'unterminated",
		]);
	});

	it("should handle compound statements for BEGINs", ({ expect }) => {
		expect(
			splitSqlQuery(`
    CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
    BEGIN
        DELETE FROM updates WHERE item_id=old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS actors_search_fts_update AFTER UPDATE ON actors
    BEGIN
        DELETE FROM search_fts WHERE rowid=old.rowid;
        INSERT INTO search_fts (rowid, type, name, preferredUsername)
        VALUES (new.rowid,
                new.type,
                json_extract(new.properties, '$.name'),
                json_extract(new.properties, '$.preferredUsername'));
    END;`)
		).toMatchInlineSnapshot(`
			[
			  "CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
			    BEGIN
			        DELETE FROM updates WHERE item_id=old.id;
			    END",
			  "CREATE TRIGGER IF NOT EXISTS actors_search_fts_update AFTER UPDATE ON actors
			    BEGIN
			        DELETE FROM search_fts WHERE rowid=old.rowid;
			        INSERT INTO search_fts (rowid, type, name, preferredUsername)
			        VALUES (new.rowid,
			                new.type,
			                json_extract(new.properties, '$.name'),
			                json_extract(new.properties, '$.preferredUsername'));
			    END",
			]
		`);

		expect(
			splitSqlQuery(`
	CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
	begin
		DELETE FROM updates WHERE item_id=old.id;
	END;
	CREATE TRIGGER IF NOT EXISTS actors_search_fts_update AFTER UPDATE ON actors
	begin
		DELETE FROM search_fts WHERE rowid=old.rowid;
		INSERT INTO search_fts (rowid, type, name, preferredUsername)
		VALUES (new.rowid,
				new.type,
				json_extract(new.properties, '$.name'),
				json_extract(new.properties, '$.preferredUsername'));
	END;`)
		).toMatchInlineSnapshot(`
			[
			  "CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
				begin
					DELETE FROM updates WHERE item_id=old.id;
				END",
			  "CREATE TRIGGER IF NOT EXISTS actors_search_fts_update AFTER UPDATE ON actors
				begin
					DELETE FROM search_fts WHERE rowid=old.rowid;
					INSERT INTO search_fts (rowid, type, name, preferredUsername)
					VALUES (new.rowid,
							new.type,
							json_extract(new.properties, '$.name'),
							json_extract(new.properties, '$.preferredUsername'));
				END",
			]
		`);
	});

	it("should handle a lowercase end closing a compound statement", ({
		expect,
	}) => {
		expect(
			splitSqlQuery(`
	CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
	begin
		DELETE FROM updates WHERE item_id=old.id;
	end;
	CREATE TABLE after_the_trigger (id TEXT PRIMARY KEY);`)
		).toMatchInlineSnapshot(`
			[
			  "CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
				begin
					DELETE FROM updates WHERE item_id=old.id;
				end",
			  "CREATE TABLE after_the_trigger (id TEXT PRIMARY KEY)",
			]
		`);
	});

	it("should handle compound statements for CASEs", ({ expect }) => {
		expect(
			splitSqlQuery(`
				CREATE TRIGGER test_after_insert_trigger AFTER
				INSERT ON test BEGIN
				SELECT CASE
						WHEN NOT EXISTS
									(SELECT 1
										FROM pragma_table_list(new."table")) THEN RAISE (
																																		ABORT,
																																		'Exception, table does not exist')
				END ; END ;

				CREATE TRIGGER test_after_insert_trigger AFTER
				INSERT ON test BEGIN
				SELECT CASE
						WHEN NOT EXISTS
									(SELECT 1
										FROM pragma_table_list(new."table")) THEN RAISE (
																																		ABORT,
																																		'Exception, table does not exist')
				END ; END ;`)
		).toMatchInlineSnapshot(`
			[
			  "CREATE TRIGGER test_after_insert_trigger AFTER
							INSERT ON test BEGIN
							SELECT CASE
									WHEN NOT EXISTS
												(SELECT 1
													FROM pragma_table_list(new."table")) THEN RAISE (
																																					ABORT,
																																					'Exception, table does not exist')
							END ; END",
			  "CREATE TRIGGER test_after_insert_trigger AFTER
							INSERT ON test BEGIN
							SELECT CASE
									WHEN NOT EXISTS
												(SELECT 1
													FROM pragma_table_list(new."table")) THEN RAISE (
																																					ABORT,
																																					'Exception, table does not exist')
							END ; END",
			]
		`);

		expect(
			splitSqlQuery(`
			CREATE TRIGGER test_after_insert_trigger AFTER
			INSERT ON test BEGIN
			SELECT case
					WHEN NOT EXISTS
								(SELECT 1
									FROM pragma_table_list(new."table")) THEN RAISE (
																																	ABORT,
																																	'Exception, table does not exist')
			END ; END ;

			CREATE TRIGGER test_after_insert_trigger AFTER
			INSERT ON test BEGIN
			SELECT case
					WHEN NOT EXISTS
								(SELECT 1
									FROM pragma_table_list(new."table")) THEN RAISE (
																																	ABORT,
																																	'Exception, table does not exist')
			END ; END ;`)
		).toMatchInlineSnapshot(`
			[
			  "CREATE TRIGGER test_after_insert_trigger AFTER
						INSERT ON test BEGIN
						SELECT case
								WHEN NOT EXISTS
											(SELECT 1
												FROM pragma_table_list(new."table")) THEN RAISE (
																																				ABORT,
																																				'Exception, table does not exist')
						END ; END",
			  "CREATE TRIGGER test_after_insert_trigger AFTER
						INSERT ON test BEGIN
						SELECT case
								WHEN NOT EXISTS
											(SELECT 1
												FROM pragma_table_list(new."table")) THEN RAISE (
																																				ABORT,
																																				'Exception, table does not exist')
						END ; END",
			]
		`);
	});

	describe("regression tests from splitter PRs #15234 #15226 #15163", () => {
		it("keeps a CASE value expression followed by a comma inside a trigger", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER update_projection AFTER INSERT ON items BEGIN UPDATE totals SET count = CASE WHEN NEW.active THEN count + 1 ELSE count END, updated_at = NEW.created_at WHERE id = NEW.parent_id; END; CREATE INDEX items_parent_id_idx ON items (parent_id);"
			);
			expect(statements).toHaveLength(2);
			expect(statements[1]).toBe(
				"CREATE INDEX items_parent_id_idx ON items (parent_id)"
			);
		});

		it("keeps a parenthesized CASE expression inside a trigger", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER my_trigger AFTER INSERT ON items BEGIN UPDATE totals SET x = (CASE WHEN NEW.active THEN 1 ELSE 0 END); UPDATE totals SET y = y + 1; END; CREATE INDEX items_idx ON items (id);"
			);
			expect(statements).toHaveLength(2);
			expect(statements[1]).toBe("CREATE INDEX items_idx ON items (id)");
		});

		it("does not treat an identifier ending in CASE as a keyword", ({
			expect,
		}) => {
			expect(
				splitSqlQuery(
					"CREATE TABLE t (foo$CASE TEXT); SELECT foo$CASE FROM t; SELECT 1;"
				)
			).toEqual([
				"CREATE TABLE t (foo$CASE TEXT)",
				"SELECT foo$CASE FROM t",
				"SELECT 1",
			]);
		});

		it("does not treat an accented identifier beginning with END as a keyword", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER my_trigger AFTER INSERT ON items BEGIN SELECT ENDα; UPDATE totals SET y = y + 1; END; CREATE INDEX items_idx ON items (id);"
			);
			expect(statements).toHaveLength(2);
			expect(statements[1]).toBe("CREATE INDEX items_idx ON items (id)");
		});

		it("does not treat qualified keyword identifiers as trigger boundaries", ({
			expect,
		}) => {
			expect(
				splitSqlQuery(
					'CREATE TRIGGER t AFTER INSERT ON items BEGIN INSERT INTO audit(v) VALUES (new.begin); END; CREATE INDEX idx ON items("begin");'
				)
			).toEqual([
				"CREATE TRIGGER t AFTER INSERT ON items BEGIN INSERT INTO audit(v) VALUES (new.begin); END",
				'CREATE INDEX idx ON items("begin")',
			]);
		});

		it("recognizes CASE immediately followed by a parenthesized expression", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER t2 AFTER INSERT ON items BEGIN UPDATE totals SET x = CASE(NEW.active) WHEN 1 THEN 1 ELSE 0 END, y = 2; UPDATE totals SET y = y + 1; END;"
			);
			expect(statements).toHaveLength(1);
		});

		it("recognizes a compact END after a parenthesized expression", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER t3 AFTER INSERT ON items BEGIN UPDATE totals SET x = (CASE WHEN NEW.active THEN 1 ELSE(0)END); UPDATE totals SET y = y + 1; END; CREATE INDEX idx3 ON items(id);"
			);
			expect(statements).toHaveLength(2);
			expect(statements[1]).toBe("CREATE INDEX idx3 ON items(id)");
		});

		it("handles bracket-quoted identifiers containing semicolons", ({
			expect,
		}) => {
			expect(
				splitSqlQuery(
					"CREATE TABLE metrics ([value;unit] TEXT); SELECT [value;unit] FROM metrics;"
				)
			).toEqual([
				"CREATE TABLE metrics ([value;unit] TEXT)",
				"SELECT [value;unit] FROM metrics",
			]);
		});

		it("handles END directly after a statement semicolon", ({ expect }) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER audit_trigger AFTER INSERT ON items BEGIN INSERT INTO audit (item_id) VALUES (new.id);END; INSERT INTO items (id) VALUES (1); SELECT * FROM items;"
			);
			expect(statements).toHaveLength(3);
		});

		it("handles BEGIN directly after a parenthesis", ({ expect }) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER audit_trigger AFTER INSERT ON items FOR EACH ROW WHEN (1=1)BEGIN INSERT INTO audit (item_id) VALUES (new.id); END; SELECT * FROM items;"
			);
			expect(statements).toHaveLength(2);
		});

		it("handles CASE expressions followed by parentheses and commas", ({
			expect,
		}) => {
			expect(
				splitSqlQuery(
					"SELECT SUM(CASE WHEN a THEN 1 ELSE 0 END) FROM t; SELECT CASE WHEN a THEN 1 ELSE 0 END, b FROM t; SELECT * FROM t;"
				)
			).toHaveLength(3);
		});

		it("does not treat an identifier ending in END as a keyword", ({
			expect,
		}) => {
			expect(
				splitSqlQuery(
					"CREATE TABLE weekend (id INTEGER PRIMARY KEY); INSERT INTO weekend (id) VALUES (1); SELECT * FROM weekend;"
				)
			).toHaveLength(3);
		});

		it("does not treat accented identifiers ending in END as keywords", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER t AFTER INSERT ON x BEGIN UPDATE y SET a = 1 WHERE b = néend; UPDATE z SET c = 2; END; SELECT 1;"
			);
			expect(statements).toHaveLength(2);
		});

		it("does not treat named parameters as trigger boundaries", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER t AFTER INSERT ON items BEGIN INSERT INTO audit (value) VALUES (:end); INSERT INTO audit (value) VALUES (:begin); END; SELECT 1;"
			);
			expect(statements).toHaveLength(2);
		});

		it("does not treat bracket-quoted identifiers as trigger boundaries", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TRIGGER t AFTER INSERT ON items BEGIN UPDATE x SET [end] = 1; UPDATE y SET z = 2; END; SELECT 1;"
			);
			expect(statements).toHaveLength(2);
		});

		it("keeps CASE expressions inside trigger bodies", ({ expect }) => {
			for (const assignment of [
				"value = CASE WHEN NEW.active THEN 1 ELSE 0 END, other = 2",
				"value = (CASE WHEN NEW.active THEN 1 ELSE 0 END), other = 2",
				"value = CASE WHEN NEW.active THEN 1 ELSE 0 END/* note */, other = 2",
				"value = CASE WHEN NEW.active THEN(1)END, other = 2",
			]) {
				const statements = splitSqlQuery(
					`CREATE TRIGGER update_projection AFTER INSERT ON source BEGIN UPDATE projections SET ${assignment}; UPDATE audit SET seen = 1; END; CREATE TABLE after_trigger (id INTEGER PRIMARY KEY);`
				);
				expect(statements, assignment).toHaveLength(2);
			}
		});

		it("does not treat keyword-shaped identifiers as trigger boundaries", ({
			expect,
		}) => {
			const statements = splitSqlQuery(
				"CREATE TABLE source (begin TEXT, start INTEGER, end INTEGER); CREATE TABLE ranges (start INTEGER, end INTEGER); CREATE TRIGGER copy_range AFTER INSERT ON source BEGIN INSERT INTO ranges (start, end) VALUES (NEW.start, NEW.end); END; CREATE TABLE after_trigger (id INTEGER PRIMARY KEY);"
			);
			expect(statements).toHaveLength(4);
		});

		it("handles trigger boundaries separated by comments", ({ expect }) => {
			const statements = splitSqlQuery(
				"CREATE/* before trigger */TRIGGER audit_source AFTER INSERT ON source BEGIN/* body */ INSERT INTO audit VALUES (NEW.id); /* before end */END/* after end */; CREATE TABLE after_trigger (id INTEGER PRIMARY KEY);"
			);
			expect(statements).toHaveLength(2);
			expect(statements[1]).toBe(
				"CREATE TABLE after_trigger (id INTEGER PRIMARY KEY)"
			);
		});

		it("handles temporary triggers", ({ expect }) => {
			for (const modifier of ["TEMP", "TEMPORARY"]) {
				const statements = splitSqlQuery(
					`CREATE ${modifier} TRIGGER audit_source AFTER INSERT ON source BEGIN INSERT INTO audit VALUES (NEW.id); END; CREATE TABLE after_trigger (id INTEGER PRIMARY KEY);`
				);
				expect(statements, modifier).toHaveLength(2);
			}
		});
	});

	describe("performance tests", () => {
		it("should split a file with a lot of commands", ({ expect }) => {
			const sql = "INSERT INTO blobs (id, data) VALUES (1, 'xxx');\n".repeat(
				5 * 1024
			);

			const startedAt = performance.now();
			const statements = splitSqlQuery(sql);
			const elapsedMs = performance.now() - startedAt;

			expect(statements).toHaveLength(5 * 1024);
			expect(statements[0]).toBe(
				"INSERT INTO blobs (id, data) VALUES (1, 'xxx')"
			);
			expect(elapsedMs).toBeLessThan(1000);
		});

		it("should split a file with a large quoted value quickly", ({
			expect,
		}) => {
			const largeValue = "x".repeat(256 * 1024);
			const sql = `INSERT INTO blobs (id, data) VALUES (1, '${largeValue}');\nSELECT count(*) FROM blobs;`;

			const startedAt = performance.now();
			const statements = splitSqlQuery(sql);
			const elapsedMs = performance.now() - startedAt;

			expect(statements).toEqual([
				`INSERT INTO blobs (id, data) VALUES (1, '${largeValue}')`,
				"SELECT count(*) FROM blobs",
			]);
			expect(elapsedMs).toBeLessThan(1000);
		});

		it("should split a file with very long comments quickly", ({ expect }) => {
			const sql = "SELECT 1; -- " + "c".repeat(256 * 1024) + "\nSELECT 2;";

			const startedAt = performance.now();
			const statements = splitSqlQuery(sql);
			const elapsedMs = performance.now() - startedAt;

			expect(statements).toHaveLength(2);
			expect(statements[0]).toBe("SELECT 1");
			expect(statements[1]).toMatch(/SELECT 2$/);
			expect(elapsedMs).toBeLessThan(1000);
		});
	});
});
