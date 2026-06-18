-- 10 menu items -> the /slow route loops over these and does one D1 query per
-- item, producing the same ~10-D1-call waterfall we saw in the real cloudbook
-- POST /api/lunch/spin request.

INSERT INTO menu_items (id, name) VALUES
  (1, 'Tacos'),
  (2, 'Ramen'),
  (3, 'Burgers'),
  (4, 'Sushi'),
  (5, 'Pizza'),
  (6, 'Salad'),
  (7, 'Curry'),
  (8, 'Pho'),
  (9, 'Falafel'),
  (10, 'Dumplings');

INSERT INTO votes (menu_item_id, voter) VALUES
  (1, 'amy'), (1, 'ben'), (2, 'cara'),
  (3, 'dan'), (3, 'eve'), (3, 'finn'),
  (5, 'gus'), (8, 'hana'), (8, 'ivan'), (10, 'jo');
