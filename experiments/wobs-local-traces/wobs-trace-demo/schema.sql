-- Minimal schema to reproduce a realistic N+1 query pattern.
-- "menu_items" is a small list; "votes" holds per-item rows we will (badly)
-- query one-at-a-time in the /slow route.

DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS menu_items;

CREATE TABLE menu_items (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE votes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  voter        TEXT NOT NULL
);
