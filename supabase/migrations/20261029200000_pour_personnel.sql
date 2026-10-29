-- Courses du personnel (29/10/2026) : un produit acheté pour l'équipe (avantage en nature), pas pour la carte.
-- Il garde sa catégorie (épicerie sucrée…) ; il sort des achats matières et alimente la liste de courses.
alter table ingredients add column if not exists pour_personnel boolean not null default false;
comment on column ingredients.pour_personnel is 'Repas du personnel (avantage en nature) : acheté pour l''équipe, pas pour la carte ; sorti des achats matières';
