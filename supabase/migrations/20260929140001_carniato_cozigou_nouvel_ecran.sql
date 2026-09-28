-- À appliquer une fois le code « envoi_equipier » en production (sinon un équipier pourrait envoyer ces commandes).
-- Carniato et Cozigou (Bello Mio) : nouvel écran, envoi par un admin.
update public.suppliers set commande_simplifiee = true, envoi_equipier = false
 where id in ('5d99bebc-658d-4dbe-a8dd-c2efd32f9421', 'eaaf8500-2fde-4f15-a2df-292a4485da14');
