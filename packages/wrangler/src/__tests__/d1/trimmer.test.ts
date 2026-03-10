import { describe, it } from "vitest";
import { mayContainTransaction, trimSqlQuery } from "../../d1/trimmer";

describe("mayContainTransaction()", () => {
	it("should return false if there for regular queries", ({ expect }) => {
		expect(mayContainTransaction(`SELECT * FROM my_table`)).toBe(false);
		expect(mayContainTransaction(`SELECT * FROM my_table WHERE id = 42;`)).toBe(
			false
		);
		expect(
			mayContainTransaction(`SELECT * FROM my_table WHERE id = 42;   `)
		).toBe(false);
	});

	it("should return true if there is a transaction", ({ expect }) => {
		expect(
			mayContainTransaction(
				`PRAGMA foreign_keys=OFF;
				BEGIN TRANSACTION;
				CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
				CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'));
				INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders');
				INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy');
				INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth');
				INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name');
				COMMIT;`
			)
		).toBe(true);
	});
});

describe("trimSqlQuery()", () => {
	it("should return original SQL if there are no real statements", ({
		expect,
	}) => {
		expect(trimSqlQuery(`;;;`)).toMatchInlineSnapshot(`";;;"`);
	});

	it("should not trim single statements", ({ expect }) => {
		expect(trimSqlQuery(`SELECT * FROM my_table`)).toMatchInlineSnapshot(
			`"SELECT * FROM my_table"`
		);
		expect(
			trimSqlQuery(`SELECT * FROM my_table WHERE id = 42;`)
		).toMatchInlineSnapshot(`"SELECT * FROM my_table WHERE id = 42;"`);
		expect(
			trimSqlQuery(`SELECT * FROM my_table WHERE id = 42;`)
		).toMatchInlineSnapshot(`"SELECT * FROM my_table WHERE id = 42;"`);
	});

	it("should trim a regular old sqlite dump", ({ expect }) => {
		expect(
			trimSqlQuery(`PRAGMA foreign_keys=OFF;
		BEGIN TRANSACTION;
		CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'));
		INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders');
		INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy');
		INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth');
		INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name');
		COMMIT;`)
		).toMatchInlineSnapshot(`
			"PRAGMA foreign_keys=OFF;
					
					CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
					CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'));
					INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders');
					INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy');
					INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth');
					INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name');
					"
		`);
	});
	it("should throw when provided multiple transactions", ({ expect }) => {
		expect(() =>
			trimSqlQuery(`PRAGMA foreign_keys=OFF;
		BEGIN TRANSACTION;
		CREATE TABLE d1_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE Customers (CustomerID INT, CompanyName TEXT, ContactName TEXT, PRIMARY KEY ('CustomerID'));
		INSERT INTO Customers VALUES(1,'Alfreds Futterkiste','Maria Anders');
		INSERT INTO Customers VALUES(4,'Around the Horn','Thomas Hardy');
		COMMIT;
		BEGIN TRANSACTION;
		INSERT INTO Customers VALUES(11,'Bs Beverages','Victoria Ashworth');
		INSERT INTO Customers VALUES(13,'Bs Beverages','Random Name');
		COMMIT;`)
		).toThrowErrorMatchingInlineSnapshot(`
			[Error: Wrangler could not process the provided SQL file, as it contains several transactions.
			D1 runs your SQL in a transaction for you.
			Please export an SQL file from your SQLite database and try again.]
		`);
	});

	it("should handle strings", ({ expect }) => {
		expect(
			trimSqlQuery(`SELECT * FROM my_table WHERE val = "foo;bar";`)
		).toMatchInlineSnapshot(`"SELECT * FROM my_table WHERE val = "foo;bar";"`);
	});

	it("should handle inline comments", ({ expect }) => {
		expect(
			trimSqlQuery(
				`SELECT * FROM my_table -- semicolons; in; comments; don't count;
        WHERE val = 'foo;bar'
        AND "col;name" = \`other;col\`; -- or identifiers (Postgres or MySQL style)`
			)
		).toMatchInlineSnapshot(`
			"SELECT * FROM my_table -- semicolons; in; comments; don't count;
			        WHERE val = 'foo;bar'
			        AND "col;name" = \`other;col\`; -- or identifiers (Postgres or MySQL style)"
		`);
	});

	it("should handle block comments", ({ expect }) => {
		expect(
			trimSqlQuery(
				`/****
        * Block comments are ignored;
        ****/
			SELECT * FROM my_table /* semicolons; in; comments; don't count; */
        WHERE val = 'foo;bar' AND count / 2 > 0`
			)
		).toMatchInlineSnapshot(`
		"/****
		        * Block comments are ignored;
		        ****/
					SELECT * FROM my_table /* semicolons; in; comments; don't count; */
		        WHERE val = 'foo;bar' AND count / 2 > 0"
	`);
	});

	it("should split multiple statements", ({ expect }) => {
		expect(
			trimSqlQuery(
				`INSERT INTO my_table (id, value) VALUES (42, 'foo');SELECT * FROM my_table WHERE id = 42 - 10;`
			)
		).toMatchInlineSnapshot(
			`"INSERT INTO my_table (id, value) VALUES (42, 'foo');SELECT * FROM my_table WHERE id = 42 - 10;"`
		);
	});

	it("should handle whitespace between statements", ({ expect }) => {
		expect(
			trimSqlQuery(`CREATE DOMAIN custom_types.email AS TEXT CHECK (VALUE ~ '^.+@.+$');
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
        );`)
		).toMatchInlineSnapshot(`
		"CREATE DOMAIN custom_types.email AS TEXT CHECK (VALUE ~ '^.+@.+$');
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
		        );"
	`);
	});

	it("should handle $...$ style string markers", ({ expect }) => {
		expect(
			trimSqlQuery(`CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = now();
              RETURN NEW;
          END;
          $$ language 'plpgsql';
          CREATE TRIGGER <trigger_name> BEFORE UPDATE ON <table_name> FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();`)
		).toMatchInlineSnapshot(`
		"CREATE OR REPLACE FUNCTION update_updated_at_column()
		          RETURNS TRIGGER AS $$
		          BEGIN
		              NEW.updated_at = now();
		              RETURN NEW;
		          END;
		          $$ language 'plpgsql';
		          CREATE TRIGGER <trigger_name> BEFORE UPDATE ON <table_name> FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();"
	`);
		expect(
			trimSqlQuery(
				`$SomeTag$Dianne's$WrongTag$;$some non tag an$identifier;; horse$SomeTag$;$SomeTag$Dianne's horse$SomeTag$`
			)
		).toMatchInlineSnapshot(
			`"$SomeTag$Dianne's$WrongTag$;$some non tag an$identifier;; horse$SomeTag$;$SomeTag$Dianne's horse$SomeTag$"`
		);
	});

	it("should handle compound statements", ({ expect }) => {
		expect(
			trimSqlQuery(
				`CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
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
    END;`
			)
		).toMatchInlineSnapshot(`
		"CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
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
		    END;"
	`);
	});
});
