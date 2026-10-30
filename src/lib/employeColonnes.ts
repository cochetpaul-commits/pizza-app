/**
 * Colonnes lisibles par les comptes connectés (managers, et chacun sur sa propre fiche).
 * Les champs confidentiels (n° sécu, IBAN, adresse, naissance, handicap, titre de séjour, note…)
 * et la rémunération des contrats sont réservés aux admins : fonctions employe_confidentiel() et contrats_admin().
 * Ne jamais lire employes / contrats avec select("*") côté écran.
 */
// Une seule chaîne littérale : le client Supabase en déduit le type des lignes
export const EMPLOYE_COLONNES = "id, etablissement_id, prenom, nom, initiales, email, tel_mobile, tel_fixe, genre, contact_urgence_prenom, contact_urgence_nom, contact_urgence_lien, contact_urgence_tel, date_visite_medicale, prochaine_visite_medicale, matricule, date_anciennete, avatar_url, actif, created_at, role, equipes_access, affichage_planning, civilite, nom_usage, custom_permissions, disponibilites, etablissements_ids, cp_n_minus_1, poste_id, auth_user_id, combo_id, combo_contract_id, date_entree, date_sortie, affichage_rup, popina_operateur" as const;

export const EMPLOYE_CONFIDENTIEL = [
  "numero_secu", "iban", "bic", "titulaire_compte", "adresse", "code_postal", "ville",
  "date_naissance", "lieu_naissance", "departement_naissance", "nationalite", "situation_familiale", "nb_personnes_charge",
  "handicap", "type_handicap", "travailleur_etranger", "autorisation_travail_type", "autorisation_travail_numero",
  "autorisation_travail_fin", "visite_renforcee", "note", "motif_sortie",
] as const;

export const CONTRAT_COLONNES = "id, employe_id, type, date_debut, date_fin, emploi, qualification, heures_semaine, jours_semaine, actif, created_at" as const;
