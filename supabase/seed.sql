-- DEMO-ONLY catalog. Names, categories, weights and shelf lives are sample data;
-- weights and all resulting expiry dates must be labeled SIMULATED in displays/docs.
insert into public.products (id, name, category, weight_kg, shelf_life_days)
values
  ('00000000-0000-4000-8000-000000000001', 'Chips', 'Snacks', 2.000, 120),
  ('00000000-0000-4000-8000-000000000002', 'Green Tea', 'Beverages', 1.250, 365),
  ('00000000-0000-4000-8000-000000000003', 'Pasta', 'Pantry', 0.750, 540),
  ('00000000-0000-4000-8000-000000000004', 'Coffee', 'Beverages', 3.500, 240)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  weight_kg = excluded.weight_kg,
  shelf_life_days = excluded.shelf_life_days;
