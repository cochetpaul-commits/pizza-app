/**
 * Vini d'Italia, livret de formation salle (édition Estate 26, rédaction Paul et Pierre Cochet), intégré à la Cave
 * le 12/11/2026. Le texte est celui du livret ; les vins cités ont été alignés sur la carte du 12/11/2026 (Chiaretto, Villamagna,
 * Langhe Nebbiolo et Voerzio, sortis de la carte, ne sont plus donnés en exemple ; le Barbaresco Ca' del Baio revient à la carte
 * et la Campanie reste comme base de connaissance, décision de Paul). Le mémo de la carte et les accords ne sont pas ici : ils sont
 * lus en direct dans la Cave, donc toujours à jour.
 */
export type Bloc =
  | { type: "p"; texte: string }
  | { type: "h"; texte: string }
  | { type: "table"; entetes: string[]; lignes: string[][] }
  | { type: "encadre"; titre: string; texte: string }
  | { type: "liste"; items: string[] }
  | { type: "qr"; items: { q: string; r: string }[] }
  | { type: "accords" }
  | { type: "memo" };
export type Chapitre = { id: string; court: string; titre: string; chapeau?: string; blocs: Bloc[] };

export const LIVRET: Chapitre[] = [
  {
    id: "avant-propos", court: "Avant-propos", titre: "Pourquoi ce livret",
    chapeau: "Un client ne commande pas un cépage. Il commande une histoire, une assurance, un moment. Ce livret vous donne les trois.",
    blocs: [
      { type: "p", texte: "La carte Estate 26 marque un tournant : nous travaillons désormais avec Oenoplaisir, caviste malouin, et nous avons fait entrer des domaines de référence : Feudo Montoni en Sicile, Ca' del Baio dans le Barbaresco, Novaia en Valpolicella, Cascina Galarin dans l'Asti, San Donato à San Gimignano, Torre Zambra et Pajaru pour le Sud. Beaucoup sont certifiés bio : c'est un argument, utilisez-le." },
      { type: "p", texte: "Chaque chapitre se lit en dix minutes. Les chapitres 5, 6 et 7 sont vos outils de service : lisez-les en premier. Le mémo de la carte tient toute la carte sur une page, avec les prix du jour." },
    ],
  },
  {
    id: "bases", court: "1 · Les bases", titre: "Les bases du vin",
    chapeau: "Trois gestes, quatre mots, un réflexe : ce qu'il faut maîtriser avant de parler d'un vin.",
    blocs: [
      { type: "h", texte: "Regarder, sentir, goûter" },
      { type: "p", texte: "L'œil donne l'âge et la concentration : un blanc doré est plus évolué ou plus riche qu'un blanc pâle ; un rouge grenat plus âgé qu'un rouge violacé. Le nez donne la famille d'arômes : fruits frais (vin jeune), fruits confits et épices (élevage), fleurs (cépages aromatiques). La bouche confirme et ajoute trois dimensions : l'acidité (la fraîcheur), le tanin (ce qui accroche sur les rouges), le corps (léger ou puissant)." },
      { type: "h", texte: "Les quatre mots qui décrivent tout" },
      { type: "table", entetes: ["Mot", "Ce que ça veut dire", "Exemple carte"], lignes: [
        ["Frais", "Acidité vive, désaltérant", "Grillo Timpa, Pinot Grigio, Vernaccia"],
        ["Fruité", "Le fruit domine, peu de bois", "Valpolicella Novaia, Barbera Mugiot"],
        ["Charnu", "Riche, généreux, mûr", "Solu Primitivo, Madia"],
        ["Structuré", "Tanins présents, vin de garde", "Barolo, Barbaresco, Amarone"],
      ] },
      { type: "h", texte: "Les arômes à connaître par cœur" },
      { type: "table", entetes: ["Famille", "Arômes", "On les trouve dans…"], lignes: [
        ["Agrumes", "Citron, pamplemousse, zeste", "Grillo, Vernaccia, Pecorino"],
        ["Fruits blancs", "Pêche, poire, amande", "Arneis, Lugana, Moscato"],
        ["Fruits rouges", "Cerise, framboise, fraise", "Valpolicella, Chianti, Nerello"],
        ["Fruits noirs", "Mûre, myrtille, pruneau", "Primitivo, Madia, Amarone"],
        ["Floral", "Rose, violette, jasmin", "Nebbiolo, Moscato d'Asti, Nero di Troia"],
        ["Épices et bois", "Réglisse, vanille, tabac", "Ripasso, Barolo, Vino Nobile"],
        ["Minéral", "Pierre, iode, fumé", "Etna Bianco, Greco di Tufo"],
      ] },
      { type: "encadre", titre: "Réflexe accords", texte: "Un plat iodé appelle un blanc salin (Grillo, Vernaccia). Un plat riche appelle soit un rouge charnu qui l'accompagne, soit un blanc vif qui le tranche. Le rosé et le Lambrusco frais rattrapent presque toutes les tables d'été." },
    ],
  },
  {
    id: "geographie", court: "2 · Géographie", titre: "La géographie du vin italien",
    chapeau: "L'Italie est une échelle de 1 200 km entre Alpes et Afrique. Plus on descend, plus le soleil gagne, et plus les vins gagnent en générosité.",
    blocs: [
      { type: "h", texte: "Le Nord : fraîcheur et noblesse" },
      { type: "p", texte: "Piémont : la Bourgogne italienne. Le Nebbiolo y donne Barolo et Barbaresco, la Barbera le quotidien gourmand, l'Arneis les blancs délicats, le Moscato la douceur. Nos maisons : Cascina Galarin (Asti), Ca' del Baio, Piazzo, Scrimaglio, Tenuta Garetto." },
      { type: "p", texte: "Lombardie : le Lugana d'Olivini, blanc tendu du lac de Garde." },
      { type: "p", texte: "Vénétie : la Valpolicella et sa pyramide (Classico → Ripasso → Amarone), chez nous en version bio par Novaia. Aussi : Prosecco (Edoardo Rota), Pinot Grigio (Durante), rosé Trevenezie." },
      { type: "p", texte: "Émilie-Romagne : le Lambrusco, bulle rouge de Modène, celle qui accompagne la mortadelle." },
      { type: "h", texte: "Le Centre : l'élégance toscane" },
      { type: "p", texte: "Toscane : le Sangiovese roi (Chianti Classico, Rosso di Montalcino, Vino Nobile), les icônes (Ornellaia, Sassicaia, Solaia, Soldera), le rosé Alìe de Frescobaldi, et la Vernaccia di San Gimignano de San Donato, premier blanc DOC de l'histoire italienne (1966)." },
      { type: "p", texte: "Marches : le Pecorino de Muròla, salin et méditerranéen." },
      { type: "p", texte: "Abruzzes : le Montepulciano (le cépage, pas la ville toscane !). Torre Zambra, famille De Cerchio depuis 1961 : le Madia bio, au verre et en bouteille." },
      { type: "h", texte: "Le Sud : le soleil dans le verre" },
      { type: "p", texte: "Campanie : le Greco di Tufo, blanc volcanique iodé." },
      { type: "p", texte: "Pouilles : le talon de la botte. Tenuta del Pajaru (bio) : Solu Primitivo charnu, Auru Nero di Troia floral. Le pajaru est l'abri en pierre sèche des bergers." },
      { type: "p", texte: "Sicile : deux mondes. L'intérieur avec Feudo Montoni, domaine historique d'altitude, bio, l'un des plus réputés d'Italie (Grillo Timpa, Lagnusa, Terre di Elio), le Zibibbo de Pellegrino à Marsala, et l'Etna volcanique (Gamma de Curtaz, Etna Rosso Murgo)." },
      { type: "p", texte: "Sardaigne : le Su'Aro de Su'Entu, blanc gras et solaire." },
      { type: "encadre", titre: "À retenir", texte: "Onze régions à connaître. Si le client hésite, vendez le voyage : « on démarre au Piémont, on finit en Sicile »." },
    ],
  },
  {
    id: "cepages", court: "3 · Cépages", titre: "Les cépages à connaître",
    chapeau: "L'Italie compte 400 cépages autochtones. Voici ceux de notre carte.",
    blocs: [
      { type: "h", texte: "Les blancs" },
      { type: "table", entetes: ["Cépage", "Profil", "Sur la carte"], lignes: [
        ["Glera", "Floral, léger : la bulle du Prosecco", "Prosecco Edoardo Rota"],
        ["Pinot Grigio", "Frais, discret, consensuel", "Durante"],
        ["Vernaccia", "Salin, amande, historique", "Tre Sorelle, San Donato"],
        ["Grillo", "Agrumes, garrigue, marin", "Timpa, Feudo Montoni"],
        ["Arneis", "Pêche, amande salée, élégant", "Barivel, Galarin"],
        ["Turbiana", "Tendu, minéral (Lugana)", "Olivini"],
        ["Pecorino", "Citron confit, herbes", "Muròla"],
        ["Greco", "Iodé, pierre à fusil", "Greco di Tufo (Campanie)"],
        ["Carricante", "Volcanique, grande finesse", "Gamma Etna, Curtaz"],
        ["Moscato", "Jasmin, pêche, doux", "Pra Donè, Galarin"],
        ["Zibibbo", "Muscat doux de Sicile", "Pellegrino"],
      ] },
      { type: "h", texte: "Les rouges" },
      { type: "table", entetes: ["Cépage", "Profil", "Sur la carte"], lignes: [
        ["Nebbiolo", "Roi du Piémont : rose, goudron, tanins nobles", "Barolo, Barbaresco Ca' del Baio"],
        ["Barbera", "Fruit vif, tanins souples", "Mugiot, Garetto"],
        ["Corvina / Corvinone", "Cerise ; base de l'Amarone", "Novaia (Classico, Ripasso, Amarone)"],
        ["Lambrusco", "Bulle rouge, fruitée", "Cavicchioli"],
        ["Sangiovese", "Cerise, épices, colonne toscane", "Chianti, Montalcino, Vino Nobile"],
        ["Montepulciano", "Fruits noirs, réglisse, velours", "Madia, Torre Zambra"],
        ["Primitivo", "Charnu, mûr, généreux (= Zinfandel)", "Solu, Pajaru"],
        ["Nero di Troia", "Floral, poivré, tanins fins", "Auru, Pajaru"],
        ["Nero d'Avola", "Fruits noirs, garrigue sicilienne", "Lagnusa, Feudo Montoni"],
        ["Nerello Mascalese", "Le « Pinot Noir de l'Etna », minéral", "Terre di Elio, Murgo"],
      ] },
      { type: "encadre", titre: "Phrase magique", texte: "« Le Primitivo est le même cépage que le Zinfandel californien : il est parti d'ici. » Effet garanti sur les amateurs." },
    ],
  },
  {
    id: "etiquette", court: "4 · Étiquette", titre: "Décoder une étiquette italienne",
    chapeau: "Quatre sigles, trois mentions : tout ce qu'une étiquette peut dire.",
    blocs: [
      { type: "h", texte: "La pyramide des appellations" },
      { type: "table", entetes: ["Sigle", "Signifie", "Sur notre carte"], lignes: [
        ["DOCG", "Sommet : origine + dégustation d'agrément, bandeau numéroté au col", "Barolo, Barbaresco, Amarone, Chianti Classico, Greco di Tufo, Vernaccia, Moscato d'Asti"],
        ["DOC", "Origine contrôlée, cahier des charges strict", "Lugana, Etna Rosso, Prosecco, Valpolicella, Madia (Montepulciano d'Abruzzo)"],
        ["IGT / IGP", "Indication régionale, plus de liberté : pas un défaut !", "Solu Primitivo (Puglia), Terre Siciliane, Su'Aro"],
        ["Vino", "Vin de table", ""],
      ] },
      { type: "p", texte: "Attention : IGT n'est pas « moins bon ». Le Sassicaia est resté IGT pendant des années. Les grands Super Toscans sont nés hors DOC par choix de liberté." },
      { type: "h", texte: "Les mentions qui comptent" },
      { type: "p", texte: "Classico = le cœur historique de la zone (Chianti Classico, Valpolicella Classico). Superiore = degré et exigence supérieurs (Ripasso Classico Superiore). Riserva = élevage prolongé (Chianti Classico Riserva). Biologico = certification bio européenne, la feuille verte sur la contre-étiquette." },
      { type: "h", texte: "Le cas Ripasso" },
      { type: "p", texte: "Le Valpolicella « repasse » sur les peaux de l'Amarone : il en prend la rondeur et les épices, sans le prix. C'est l'argument de vente parfait : « l'esprit de l'Amarone, en plus accessible »." },
      { type: "encadre", titre: "Gallo Nero", texte: "Le coq noir du Chianti Classico garantit la zone historique. La légende : au Moyen Âge, Florence et Sienne fixèrent leur frontière par une course de cavaliers partant au chant du coq. Les Florentins prirent un coq noir affamé : il chanta avant l'aube, leur cavalier partit en avance, et Florence rafla presque tout le Chianti. Trente secondes d'histoire qui vendent une bouteille." },
    ],
  },
  {
    id: "lexique", court: "5 · Lexique salle", titre: "Le lexique salle",
    chapeau: "Le client parle rarement le langage du vin. À vous de traduire.",
    blocs: [
      { type: "h", texte: "Traduire le client" },
      { type: "table", entetes: ["Le client dit…", "Il veut…", "Servez"], lignes: [
        ["« Un blanc léger »", "Frais, sans bois, facile", "Pinot Grigio, Vernaccia"],
        ["« Un blanc qui a du goût »", "Aromatique ou riche", "Grillo Timpa, Arneis, Su'Aro"],
        ["« Un rouge léger »", "Peu de tanins, fruité", "Valpolicella Novaia (frais !)"],
        ["« Un rouge qui tache »", "Puissant, charnu", "Solu Primitivo, Madia"],
        ["« Un vin pas trop sec »", "Souvent : souple, fruité (pas sucré)", "Rosé Alìe, Valpolicella, Lambrusco"],
        ["« Comme un Sancerre »", "Blanc vif et minéral", "Vernaccia, Lugana"],
        ["« Comme un Bordeaux »", "Structuré, boisé", "Vino Nobile, Lucente, Chianti Riserva"],
        ["« Quelque chose d'original »", "Une histoire à boire", "Nero di Troia, Etna Rosso, Lambrusco"],
      ] },
      { type: "h", texte: "Les pièges à éviter" },
      { type: "liste", items: [
        "Ne jamais dire « c'est notre entrée de gamme » : dire « notre plus accessible » ou « le préféré des habitués ».",
        "Ne pas noyer sous les cépages : un nom, un profil, un accord. Trois phrases maximum.",
        "« Sec » prête à confusion : pour beaucoup de clients, sec = dur. Préférez « frais » ou « vif ».",
        "Montepulciano : le cépage des Abruzzes n'a rien à voir avec le Vino Nobile di Montepulciano (ville toscane, cépage Sangiovese). Si le client mélange, souriez et racontez-le.",
      ] },
      { type: "encadre", titre: "La question en or", texte: "« Vous partez plutôt sur quelque chose de frais ou de généreux ? » Une seule question, deux familles, la vente est faite." },
    ],
  },
  {
    id: "pont", court: "6 · France ↔ Italie", titre: "Le pont France ↔ Italie",
    chapeau: "Le client malouin connaît les vins français. Douze passerelles pour le faire voyager sans le perdre.",
    blocs: [
      { type: "table", entetes: ["Si le client aime…", "Proposez…", "Le mot de passage"], lignes: [
        ["Sancerre / Pouilly", "Vernaccia San Donato", "« La même tension, avec l'amande toscane »"],
        ["Muscadet", "Grillo Timpa", "« L'iode en version sicilienne »"],
        ["Chablis", "Lugana, Etna Bianco", "« Minéralité pure, lac ou volcan »"],
        ["Bourgogne blanc rond", "Arneis Barivel", "« Texture et pêche jaune »"],
        ["Viognier / Condrieu", "Su'Aro Sardaigne", "« Gras et solaire »"],
        ["Bourgogne rouge", "Nerello (Etna Rosso, Terre di Elio)", "« Le Pinot Noir du volcan »"],
        ["Beaujolais", "Valpolicella Novaia", "« Fruit croquant, servi frais »"],
        ["Côtes-du-Rhône", "Madia Montepulciano", "« Généreux et épicé »"],
        ["Châteauneuf / Gigondas", "Solu Primitivo, Amarone", "« Puissance et fruits mûrs »"],
        ["Bordeaux rive gauche", "Lucente, Sassicaia", "« Structure et race »"],
        ["Rosé de Provence", "Rosé Alìe Frescobaldi", "« Pâle, sec, mais avec du fruit »"],
        ["Champagne", "Prosecco (apéritif), Champagne (grande occasion)", "« Deux moments, deux bulles »"],
      ] },
      { type: "encadre", titre: "Attention", texte: "Le pont est une passerelle, pas une équivalence. Toujours conclure par ce que le vin italien a en plus : un cépage unique, un volcan, une histoire." },
    ],
  },
  {
    id: "vendre", court: "7 · Vendre", titre: "Vendre le vin en salle",
    chapeau: "La carte est construite pour que chaque plat ait son verre. Votre travail : faire la suggestion avant que le client ne demande.",
    blocs: [
      { type: "h", texte: "Les accords du moment, à connaître par cœur" },
      { type: "accords" },
      { type: "h", texte: "L'escalier de vente" },
      { type: "p", texte: "Verre → pichet : dès que deux personnes prennent le même verre, « en pichet, c'est comme trois verres et demi au prix de trois ». Pichet → bouteille : à quatre convives ou sur les vins qui existent en bouteille. Montée en gamme : proposer un cran au-dessus une fois sur deux (« et si vous voulez découvrir le niveau au-dessus, le Ripasso… »)." },
      { type: "h", texte: "Six objections, six réponses" },
      { type: "qr", items: [
        { q: "« C'est cher pour un vin italien »", r: "« Le Barbaresco de Ca' del Baio est un cru historique noté 95 points : à Paris, il serait 30 € plus cher. »" },
        { q: "« Je ne connais pas »", r: "« C'est justement pour ça qu'on l'a choisi. Je vous sers un fond pour goûter ? » (le geste coûte 2 cl et vend un verre)" },
        { q: "« Le Lambrusco, c'est sucré non ? »", r: "« Le nôtre se sert bien frais : c'est la bulle de la mortadelle. »" },
        { q: "« Un rouge en été, trop lourd »", r: "« Le Valpolicella se sert frais comme un rosé : c'est le rouge d'été des Vénitiens. »" },
        { q: "« Vous n'avez pas de Sancerre ? »", r: "« Non, mais j'ai sa cousine toscane : la Vernaccia, premier blanc classé d'Italie. »" },
        { q: "« Juste une carafe d'eau »", r: "Sourire, servir l'eau, et suggérer un verre au moment du plat. Jamais d'insistance à la commande." },
      ] },
      { type: "h", texte: "Trois pitchs de 15 secondes" },
      { type: "liste", items: [
        "« Feudo Montoni, c'est un domaine de montagne au centre de la Sicile, bio, l'un des plus réputés d'Italie. Leur Grillo, c'est l'iode et les agrumes : parfait avec votre risotto de la mer. »",
        "« Le Ripasso, c'est le petit frère de l'Amarone : il repasse sur ses peaux et en prend le velours. Toute la Vénétie dans un verre, sans le prix de l'Amarone. »",
        "« Torre Zambra, c'est une famille des Abruzzes depuis 1961. Le Madia est bio, généreux, fruits noirs et réglisse : il est fait pour la tagliata. »",
      ] },
    ],
  },
  {
    id: "memo", court: "Mémo de la carte", titre: "Mémo express : la carte du jour",
    chapeau: "Toute la carte sur une page, lue en direct dans la Cave : les prix et les vins sont ceux d'aujourd'hui.",
    blocs: [{ type: "memo" }],
  },
];

export const GLOSSAIRE: [string, string][] = [
  ["Acidité", "La fraîcheur du vin ; ce qui fait saliver."],
  ["Amarone", "Grand rouge de Vénétie issu de raisins passerillés (séchés)."],
  ["Appassimento", "Séchage des raisins avant vinification (Amarone, Ripasso)."],
  ["Autochtone", "Cépage originaire de sa région, qu'on ne trouve (presque) que là."],
  ["Biologico", "Certification bio européenne : feuille verte sur la contre-étiquette."],
  ["Blanc de blancs", "Bulle issue uniquement de raisins blancs."],
  ["Botte", "Grands foudres de bois traditionnels (élevage doux)."],
  ["Bouchonné", "Défaut du liège : odeur de carton humide. On remplace sans discuter."],
  ["Brut / Extra brut", "Bulle peu ou très peu dosée en sucre."],
  ["Cépage", "La variété de raisin."],
  ["Charnu", "Vin riche en matière, qui « remplit » la bouche."],
  ["Classico", "Cœur historique d'une appellation."],
  ["Cru", "Parcelle ou lieu-dit reconnu pour sa qualité (ex. Vallegrande)."],
  ["Cuvée", "Assemblage ou sélection spécifique d'un domaine."],
  ["DOC / DOCG", "Appellations d'origine ; la DOCG est le sommet, bandeau au col."],
  ["Élevage", "Repos du vin (cuve, bois, bouteille) avant commercialisation."],
  ["Frizzante", "Légèrement pétillant (moins de pression qu'un spumante)."],
  ["Gallo Nero", "Le coq noir, sceau du Chianti Classico."],
  ["IGT / IGP", "Indication géographique, plus libre que la DOC : pas un défaut."],
  ["Liquoroso", "Vin muté ou riche, doux et puissant (Zibibbo, Marsala)."],
  ["Millésime", "L'année de récolte."],
  ["Minéral", "Sensation de pierre, d'iode, de fumée : volcans et calcaires."],
  ["Passito", "Vin doux de raisins séchés."],
  ["Perlage", "La finesse des bulles."],
  ["Riserva", "Élevage prolongé selon le cahier des charges."],
  ["Ripasso", "Valpolicella « repassé » sur les peaux d'Amarone."],
  ["Robe", "La couleur du vin."],
  ["Salin / Iodé", "Finale légèrement salée : vins de bord de mer ou de sols marins."],
  ["Spumante", "Vin effervescent (pleine pression)."],
  ["Superiore", "Degré naturel et exigences supérieurs à la version de base."],
  ["Tanin", "Ce qui accroche le palais sur un rouge ; s'assouplit avec le temps."],
  ["Tenuta", "Domaine, propriété."],
  ["Terroir", "Sol + climat + savoir-faire : ce que le vin raconte."],
  ["Vendange", "La récolte."],
  ["Vinification", "La transformation du raisin en vin."],
];
