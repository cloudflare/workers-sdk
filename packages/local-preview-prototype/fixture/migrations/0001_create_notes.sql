CREATE TABLE notes (
	id TEXT PRIMARY KEY,
	text TEXT NOT NULL
);
CREATE INDEX notes_text ON notes (text);
