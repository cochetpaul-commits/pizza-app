import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // eslint-config-next 16 embarque eslint-plugin-react-hooks v6, qui ajoute des
      // règles anticipant le React Compiler (refs/set-state-in-effect/purity/
      // immutability/preserve-manual-memoization/use-memo/static-components).
      // `reactCompiler` n'est pas activé dans next.config.ts : ces règles signalent
      // des dizaines de patterns existants et intentionnels (ref "dernière valeur"
      // mise à jour pendant le render, setState dans un effet de chargement) qui
      // sont sans danger sous le runtime classique. À réévaluer seulement si le
      // React Compiler est activé un jour (décision produit à part).
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/static-components": "off",
      // `window.location.href = "/chemin"` : utilisé volontairement pour un
      // rechargement complet après connexion/déconnexion/suppression (reset de
      // tout l'état client) — pas une erreur de navigation relative.
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Projet Apps Script (clasp) : code ES5 pour le moteur V8 de Google, testé avec node:test
    "apps-script/**",
  ]),
]);

export default eslintConfig;
