import splitSqlQuery, { mayContainMultipleStatements } from "../../d1/splitter";

describe("mayContainMultipleStatements()", () => {
	it("should return false if there is only a semi-colon at the end", () => {
		expect(mayContainMultipleStatements(`SELECT * FROM my_table`)).toBe(false);
		expect(
			mayContainMultipleStatements(`SELECT * FROM my_table WHERE id = 42;`)
		).toBe(false);
		expect(
			mayContainMultipleStatements(`SELECT * FROM my_table WHERE id = 42;   `)
		).toBe(false);
	});

	it("should return true if there is a semi-colon before the end of the string", () => {
		expect(
			mayContainMultipleStatements(
				`SELECT * FROM my_table WHERE val = "foo;bar";`
			)
		).toBe(true);
	});

	it("should return true if there is more than one statement", () => {
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
	it("should return original SQL if there are no real statements", () => {
		expect(splitSqlQuery(`;;;`)).toMatchInlineSnapshot(`
		Array [
		  ";;;",
		]
	`);
	});

	it("should not split single statements", () => {
		expect(splitSqlQuery(`SELECT * FROM my_table`)).toMatchInlineSnapshot(`
		Array [
		  "SELECT * FROM my_table",
		]
	`);
		expect(splitSqlQuery(`SELECT * FROM my_table WHERE id = 42;`))
			.toMatchInlineSnapshot(`
		Array [
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
		Array [
		  "
		      SELECT * FROM my_table WHERE id = 42;
		    ",
		]
	`);
	});

	it("should handle strings", () => {
		expect(
			splitSqlQuery(
				`
      SELECT * FROM my_table WHERE val = "foo;bar";
    `
			)
		).toMatchInlineSnapshot(`
		Array [
		  "SELECT * FROM my_table WHERE val = \\"foo;bar\\"",
		]
	`);
	});

	it("should handle inline comments", () => {
		expect(
			splitSqlQuery(
				`SELECT * FROM my_table -- semicolons; in; comments; don't count;
        WHERE val = 'foo;bar'
        AND "col;name" = \`other;col\`; -- or identifiers (Postgres or MySQL style)`
			)
		).toMatchInlineSnapshot(`
		Array [
		  "SELECT * FROM my_table -- semicolons; in; comments; don't count;
		        WHERE val = 'foo;bar'
		        AND \\"col;name\\" = \`other;col\`",
		  "-- or identifiers (Postgres or MySQL style)",
		]
	`);
	});

	it("should handle block comments", () => {
		expect(
			splitSqlQuery(
				`/****
        * Block comments are ignored;
        ****/
			SELECT * FROM my_table /* semicolons; in; comments; don't count; */
        WHERE val = 'foo;bar' AND count / 2 > 0`
			)
		).toMatchInlineSnapshot(`
		Array [
		  "/****
		        * Block comments are ignored;
		        ****/
					SELECT * FROM my_table /* semicolons; in; comments; don't count; */
		        WHERE val = 'foo;bar' AND count / 2 > 0",
		]
	`);
	});

	it("should split multiple statements", () => {
		expect(
			splitSqlQuery(
				`
        INSERT INTO my_table (id, value) VALUES (42, 'foo');
        SELECT * FROM my_table WHERE id = 42 - 10;
      `
			)
		).toMatchInlineSnapshot(`
		Array [
		  "INSERT INTO my_table (id, value) VALUES (42, 'foo')",
		  "SELECT * FROM my_table WHERE id = 42 - 10",
		]
	`);
	});

	it("should handle whitespace between statements", () => {
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
		Array [
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

	it("should handle $...$ style string markers", () => {
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
		    Array [
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
		Array [
		  "$SomeTag$Dianne's$WrongTag$;$some non tag an$identifier;; horse$SomeTag$",
		  "$SomeTag$Dianne's horse$SomeTag$",
		]
	`);
	});

	it("should handle compound statements", () => {
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
		Array [
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
	});
});
