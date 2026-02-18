import { describe, it } from "vitest";
import { mayContainMultipleStatements, splitSqlQuery } from "../../d1/splitter";

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
			  "SELECT * FROM my_table 
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
			  "SELECT * FROM my_table 
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
			  "SELECT * FROM my_table WHERE id = 42 - 10",
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

	it("should handle $...$ style string markers", ({ expect }) => {
		expect(
			splitSqlQuery(`
          CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = now();
              RETURN NEW;
          END;
          $$ language 'plpgsql';
          CREATE TRIGGER <trigger_name> BEFORE UPDATE ON <table_name> FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
        `)
		).toMatchInlineSnapshot(`
			[
			  "CREATE OR REPLACE FUNCTION update_updated_at_column()
			          RETURNS TRIGGER AS $$
			          BEGIN
			              NEW.updated_at = now();
			              RETURN NEW;
			          END;
			          $$ language 'plpgsql'",
			  "CREATE TRIGGER <trigger_name> BEFORE UPDATE ON <table_name> FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()",
			]
		`);
		expect(
			splitSqlQuery(
				`$SomeTag$Dianne's$WrongTag$;$some non tag an$identifier;; horse$SomeTag$;$SomeTag$Dianne's horse$SomeTag$`
			)
		).toMatchInlineSnapshot(`
			[
			  "$SomeTag$Dianne's$WrongTag$;$some non tag an$identifier;; horse$SomeTag$",
			  "$SomeTag$Dianne's horse$SomeTag$",
			]
		`);
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
});
