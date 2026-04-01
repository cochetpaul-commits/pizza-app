import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";

/**
 * POST /api/tresorerie/recategorize
 * Re-run categorization on ALL existing bank operations for this establishment.
 * Uses both hardcoded rules from bankParser.ts and custom rules from bank_category_rules.
 */
export async function POST(request: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Load custom rules
  const { data: customRules } = await supabaseAdmin
    .from("bank_category_rules")
    .select("pattern, category")
    .eq("etablissement_id", etabId);
  const rules = (customRules ?? []) as { pattern: string; category: string }[];

  // Load all operations
  const { data: ops, error } = await supabaseAdmin
    .from("bank_operations")
    .select("id, label, amount, category")
    .eq("etablissement_id", etabId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ops || ops.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  // Import categorize function logic inline (can't import from client lib in API route easily)
  function categorize(label: string, amount: number): string {
    const upper = label.toUpperCase();

    if (upper.startsWith("*CB COM") || upper.includes("*CB COM")) return "commission_cb";
    if (/^CB\s/.test(upper) && (upper.includes("LA MAMMA") || upper.includes("POPINA") || upper.includes("BELLO") || upper.includes("PICCOLA") || upper.includes("SASHA") || upper.includes("FRATELLI"))) return "encaissement_cb";
    if (/^CB\s/.test(upper) && amount > 0) return "encaissement_cb";
    if (/^CB\s/.test(upper) && amount < 0) return "depense_cb";
    if (upper.startsWith("COMMISSIONS") || upper.startsWith("REM VIR SEPA")) return "commission_cb";

    if (upper.includes("METRO") || upper.includes("TERREAZUR") || upper.includes("CARNIATO") || upper.includes("COZIGOU") || upper.includes("VINOFLO") || upper.includes("MAEL") || upper.includes("BAR SPIRITS") || upper.includes("MYSPIRITS") || upper.includes("GOCARDLESS") || upper.includes("MASSE") || upper.includes("SDPF") || upper.includes("ELIEN") || upper.includes("PECHEURS") || upper.includes("CAFE CELTIK") || upper.includes("VINO E GUSTO") || upper.includes("VIA DEL TE") || upper.includes("JDC") || upper.includes("ARMOREMBALLAGE")) return "fournisseur";

    if (/\b(TESSIER|THEULICIDE|HERNANDEZ|BODIN|RONDEAU|GHESTIN|DIALLO)\b/.test(upper)) return "salaire";
    if (/\bCOCHET\s+PIERRE\b/.test(upper)) return "remuneration_gerant";
    if (/\b(CLEMENCE\s+MARQUET|LAURINE\s+BLANDIN|LUCAS\s+CASSIE|CLICHER|MERCIER\s+ALAIN|BEEZIGN)\b/.test(upper)) return "prestataire";

    if (upper.includes("DGFIP") || upper.includes("SGC DOL") || upper.includes("DIRECTION GENERALE DES FINA")) return "impots";
    if (upper.includes("URSSAF") || upper.includes("KLESIA") || upper.includes("PREVOYANCE") || upper.includes("MUTUELLE") || upper.includes("AG2R") || upper.includes("MALAKOFF") || upper.includes("HUMANIS") || upper.includes("SANTE TRAVAIL")) return "charges_sociales";
    if (upper.includes("GENERALI") || upper.includes("ALAN") || upper.includes("ASSURANCE") || upper.includes("INSURANCE") || upper.includes("SEDGWICK") || upper.includes("LEASCORP")) return "assurance";
    if (upper.includes("SCI GABY") || upper.includes("LOYER")) return "loyer";
    if (upper.includes("DA CARMELA") || upper.includes("FRATELLI") || upper.includes("PICCOLA")) return "transfert_interne";
    if (upper.includes("ECH PRET") || upper.includes("PREFILOC")) return "pret";
    if (upper.includes("CREDIPAR") || upper.includes("LIXXBAIL") || upper.includes("LOCAM") || upper.includes("LEASE") || upper.includes("LOA")) return "leasing";
    if (upper.includes("LAVANDIERE")) return "blanchisserie";
    if (upper.includes("SARP") || upper.includes("NUISIBLE") || upper.includes("AFFUTAGE") || upper.includes("THERMI FROID") || upper.includes("EFC MARQUET") || upper.includes("HYG-UP") || upper.includes("PEDRON")) return "entretien";
    if (upper.includes("DSM REMOND")) return "location";
    if (upper.includes("SULSUL") || upper.includes("SUL SUL") || upper.includes("LEQUERTIER") || upper.includes("RP OUEST")) return "travaux";
    if (upper.includes("AUDIT") || upper.includes("COMPTAB") || upper.includes("EXPERT") || upper.includes("PENNYLANE") || upper.includes("SWAN")) return "comptabilite";
    if (upper.includes("SACEM") || upper.includes("SPRE") || upper.includes("YAVIN") || upper.includes("ZENCHEF") || upper.includes("OPENAI") || upper.includes("CHATGPT") || upper.includes("COPILHOST") || upper.includes("SPOTIFY") || upper.includes("APPLE.COM")) return "abonnement";
    if (upper.includes("ORANGE") || upper.includes("SFR") || upper.includes("BOUYGUES") || upper.includes("FREE") || upper.includes("ENGIE") || upper.includes("UBEFONE") || upper.includes("REGIE MALOUINE")) return "telecom_energie";
    if (upper.includes("EPARGNE SAL") || upper.includes("ABONDEMENT")) return "epargne_salariale";
    if (upper.includes("COTIS") || upper.includes("COTISATION") || upper.includes("FRAIS BANCAIRE") || upper.includes("COMMISSION INTERVENTION") || upper.includes("AGIOS") || upper.includes("MVT(S) VIR") || (upper.includes("FRAIS") && upper.includes("VIR"))) return "frais_bancaires";
    if (upper.includes("EDENRED") || upper.includes("PLUXEE") || upper.includes("UP COOP") || upper.includes("SWILE") || upper.includes("SODEXO")) return "titres_restaurant";
    if (upper.includes("AMERICAN EXPRESS") && amount > 0) return "encaissement_cb";
    if (upper.includes("VIR SEPA") || upper.includes("VIR INST") || upper.includes("VIREMENT")) return amount >= 0 ? "virement_entrant" : "virement_sortant";
    if (upper.includes("PRLV") || upper.includes("PRELEVEMENT") || upper.startsWith("LCR ")) return "prelevement";

    return "autre";
  }

  let updated = 0;
  for (const op of ops) {
    let newCat = categorize(op.label, Number(op.amount));

    // Check custom rules for "autre" category
    if (newCat === "autre" && rules.length > 0) {
      const upperLabel = op.label.toUpperCase();
      for (const rule of rules) {
        if (upperLabel.includes(rule.pattern.toUpperCase())) {
          newCat = rule.category;
          break;
        }
      }
    }

    if (newCat !== op.category) {
      await supabaseAdmin.from("bank_operations").update({ category: newCat }).eq("id", op.id);
      updated++;
    }
  }

  return NextResponse.json({ ok: true, total: ops.length, updated });
}
