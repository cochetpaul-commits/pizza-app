export type Etablissement = {
  id: string;
  slug: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  popina_location_id: string | null;
  couleur: string;
  logo_url: string | null;
  actif: boolean;
};
