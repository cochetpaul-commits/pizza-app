import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST() {
  // Test if table exists
  const { error: testErr } = await supabase.from("ventes_lignes").select("id").limit(1);

  if (!testErr) {
    return NextResponse.json({ ok: true, msg: "Table already exists" });
  }

  // Table doesn't exist — need to create via SQL editor in Supabase dashboard
  return NextResponse.json({
    ok: false,
    msg: "Table ventes_lignes n'existe pas. Executez ce SQL dans le dashboard Supabase (SQL Editor) :",
    sql: `CREATE TABLE IF NOT EXISTS ventes_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID NOT NULL,
  ouvert_a TIMESTAMPTZ NOT NULL,
  ferme_a TIMESTAMPTZ,
  date_service DATE NOT NULL,
  service TEXT,
  salle TEXT,
  table_num TEXT,
  couverts INTEGER DEFAULT 0,
  num_fiscal TEXT,
  statut TEXT,
  client TEXT,
  operateur TEXT,
  categorie TEXT,
  sous_categorie TEXT,
  type_ligne TEXT,
  description TEXT,
  menu TEXT,
  quantite INTEGER DEFAULT 1,
  tarification TEXT,
  annule BOOLEAN DEFAULT FALSE,
  raison_annulation TEXT,
  perdu BOOLEAN DEFAULT FALSE,
  raison_perte TEXT,
  transfere BOOLEAN DEFAULT FALSE,
  taux_tva TEXT,
  prix_unitaire NUMERIC(10,2) DEFAULT 0,
  remise_totale NUMERIC(10,2) DEFAULT 0,
  ttc NUMERIC(10,2) DEFAULT 0,
  tva NUMERIC(10,2) DEFAULT 0,
  ht NUMERIC(10,2) DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  import_file TEXT
);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_date ON ventes_lignes(date_service);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_etab ON ventes_lignes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_etab_date ON ventes_lignes(etablissement_id, date_service);
ALTER TABLE ventes_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventes_lignes_all" ON ventes_lignes FOR ALL USING (true) WITH CHECK (true);`
  });
}
