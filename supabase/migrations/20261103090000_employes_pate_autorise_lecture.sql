-- La colonne « Formé à la pâte » (02/11/2026) doit être lisible par la liste de l'équipe :
-- les droits de lecture sur employes sont donnés colonne par colonne (20260929100001). Sans ce droit,
-- la requête de la page Équipe échouait entière et la liste s'affichait vide.
grant select (pate_autorise) on public.employes to authenticated;
