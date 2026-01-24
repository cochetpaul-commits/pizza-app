--
-- PostgreSQL database dump
--

-- \restrict CVXut6lE4OK41l11UmPx01RjevsUiQKoMpayvQUavNyQlj2qZFOT4thTqEE3les

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: dough_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."dough_type" AS ENUM (
    'directe',
    'biga',
    'focaccia'
);


ALTER TYPE "public"."dough_type" OWNER TO "postgres";

--
-- Name: ingredient_stage; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."ingredient_stage" AS ENUM (
    'pre',
    'post'
);


ALTER TYPE "public"."ingredient_stage" OWNER TO "postgres";

--
-- Name: unit_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."unit_type" AS ENUM (
    'g',
    'ml',
    'pcs',
    'pinch',
    'dash'
);


ALTER TYPE "public"."unit_type" OWNER TO "postgres";

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: batch_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batch_results" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "grams" numeric NOT NULL
);


ALTER TABLE "public"."batch_results" OWNER TO "postgres";

--
-- Name: batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "balls_count" integer NOT NULL,
    "ball_weight" numeric NOT NULL,
    "t_ambient" numeric,
    "t_flour" numeric,
    "t_biga" numeric,
    "water_temp_phase1" numeric,
    "water_temp_phase2" numeric,
    "notes" "text",
    CONSTRAINT "batches_ball_weight_check" CHECK (("ball_weight" > (0)::numeric)),
    CONSTRAINT "batches_balls_count_check" CHECK (("balls_count" > 0))
);


ALTER TABLE "public"."batches" OWNER TO "postgres";

--
-- Name: doughs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."doughs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "hydration" numeric(5,2),
    "salt" numeric(5,2),
    "yeast" numeric(6,3),
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."doughs" OWNER TO "postgres";

--
-- Name: flour_blends; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."flour_blends" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "flour_ingredient_id" "uuid" NOT NULL,
    "percent_of_flour" numeric NOT NULL
);


ALTER TABLE "public"."flour_blends" OWNER TO "postgres";

--
-- Name: flours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."flours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "w" integer,
    "protein" numeric,
    "ash" numeric,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."flours" OWNER TO "postgres";

--
-- Name: formula_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."formula_lines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "percent_value" numeric,
    "is_computed" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."formula_lines" OWNER TO "postgres";

--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "allergens" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "default_unit" "text" DEFAULT 'g'::"text" NOT NULL,
    CONSTRAINT "ingredients_category_check" CHECK (("category" = ANY (ARRAY['fromage'::"text", 'charcuterie'::"text", 'legume'::"text", 'sauce'::"text", 'huile'::"text", 'epice'::"text", 'herbe'::"text", 'poisson'::"text", 'autre'::"text"])))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";

--
-- Name: pizza_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pizza_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pizza_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "stage" "public"."ingredient_stage" NOT NULL,
    "qty" numeric(10,3) NOT NULL,
    "unit" "public"."unit_type" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pizza_ingredients" OWNER TO "postgres";

--
-- Name: pizza_recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pizza_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "dough_recipe_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_url" "text"
);


ALTER TABLE "public"."pizza_recipes" OWNER TO "postgres";

--
-- Name: pizzas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pizzas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "recipe_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pizzas" OWNER TO "postgres";

--
-- Name: recipe_flours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recipe_flours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "flour_id" "uuid" NOT NULL,
    "pct" numeric NOT NULL,
    "sort" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."recipe_flours" OWNER TO "postgres";

--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "unit" "text" DEFAULT 'g'::"text" NOT NULL,
    "sort" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";

--
-- Name: recipe_phases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recipe_phases" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phase_order" integer NOT NULL
);


ALTER TABLE "public"."recipe_phases" OWNER TO "postgres";

--
-- Name: recipe_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recipe_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "dough_type" "public"."dough_type" NOT NULL,
    "default_hydration" numeric NOT NULL,
    "default_salt_pct" numeric NOT NULL,
    "default_yeast_pct" numeric NOT NULL,
    "default_oil_pct" numeric DEFAULT 0 NOT NULL,
    "default_honey_pct" numeric DEFAULT 0 NOT NULL,
    "biga_flour_pct" numeric,
    "biga_hydration" numeric,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recipe_templates" OWNER TO "postgres";

--
-- Name: recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "biga_percent" numeric,
    "hydration_total" numeric NOT NULL,
    "salt_percent" numeric NOT NULL,
    "honey_percent" numeric DEFAULT 0 NOT NULL,
    "oil_percent" numeric DEFAULT 0 NOT NULL,
    "biga_hydration" numeric,
    "biga_yeast_percent" numeric DEFAULT 0,
    "target_temp_phase1" numeric,
    "target_temp_phase2" numeric,
    "mixer_factor" numeric DEFAULT 6 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "yeast_percent" numeric DEFAULT 0 NOT NULL,
    "flour_mix" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "balls_count" integer DEFAULT 150 NOT NULL,
    "ball_weight" integer DEFAULT 264 NOT NULL,
    "procedure" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "ball_weight_positive" CHECK ((("ball_weight" > 0) AND ("ball_weight" < 2000))),
    CONSTRAINT "balls_count_positive" CHECK (("balls_count" > 0)),
    CONSTRAINT "recipes_ball_weight_min" CHECK (("ball_weight" >= 1)),
    CONSTRAINT "recipes_balls_count_min" CHECK (("balls_count" >= 1)),
    CONSTRAINT "recipes_biga_yeast_percent_min" CHECK (("biga_yeast_percent" >= (0)::numeric)),
    CONSTRAINT "recipes_type_check" CHECK (("type" = ANY (ARRAY['biga'::"text", 'direct'::"text", 'focaccia'::"text"]))),
    CONSTRAINT "recipes_yeast_percent_min" CHECK (("yeast_percent" >= (0)::numeric))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";

--
-- Name: batch_results batch_results_batch_id_phase_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_results"
    ADD CONSTRAINT "batch_results_batch_id_phase_id_ingredient_id_key" UNIQUE ("batch_id", "phase_id", "ingredient_id");


--
-- Name: batch_results batch_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_results"
    ADD CONSTRAINT "batch_results_pkey" PRIMARY KEY ("id");


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_pkey" PRIMARY KEY ("id");


--
-- Name: doughs doughs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."doughs"
    ADD CONSTRAINT "doughs_pkey" PRIMARY KEY ("id");


--
-- Name: flour_blends flour_blends_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flour_blends"
    ADD CONSTRAINT "flour_blends_pkey" PRIMARY KEY ("id");


--
-- Name: flour_blends flour_blends_recipe_id_phase_id_flour_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flour_blends"
    ADD CONSTRAINT "flour_blends_recipe_id_phase_id_flour_ingredient_id_key" UNIQUE ("recipe_id", "phase_id", "flour_ingredient_id");


--
-- Name: flours flours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flours"
    ADD CONSTRAINT "flours_pkey" PRIMARY KEY ("id");


--
-- Name: formula_lines formula_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."formula_lines"
    ADD CONSTRAINT "formula_lines_pkey" PRIMARY KEY ("id");


--
-- Name: formula_lines formula_lines_recipe_id_phase_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."formula_lines"
    ADD CONSTRAINT "formula_lines_recipe_id_phase_id_ingredient_id_key" UNIQUE ("recipe_id", "phase_id", "ingredient_id");


--
-- Name: ingredients ingredients_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_name_key" UNIQUE ("name");


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");


--
-- Name: pizza_ingredients pizza_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_ingredients"
    ADD CONSTRAINT "pizza_ingredients_pkey" PRIMARY KEY ("id");


--
-- Name: pizza_recipes pizza_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_recipes"
    ADD CONSTRAINT "pizza_recipes_pkey" PRIMARY KEY ("id");


--
-- Name: pizzas pizzas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizzas"
    ADD CONSTRAINT "pizzas_pkey" PRIMARY KEY ("id");


--
-- Name: recipe_flours recipe_flours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_flours"
    ADD CONSTRAINT "recipe_flours_pkey" PRIMARY KEY ("id");


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");


--
-- Name: recipe_phases recipe_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_phases"
    ADD CONSTRAINT "recipe_phases_pkey" PRIMARY KEY ("id");


--
-- Name: recipe_phases recipe_phases_recipe_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_phases"
    ADD CONSTRAINT "recipe_phases_recipe_id_name_key" UNIQUE ("recipe_id", "name");


--
-- Name: recipe_templates recipe_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_templates"
    ADD CONSTRAINT "recipe_templates_pkey" PRIMARY KEY ("id");


--
-- Name: recipe_templates recipe_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_templates"
    ADD CONSTRAINT "recipe_templates_slug_key" UNIQUE ("slug");


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");


--
-- Name: doughs_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "doughs_name_unique" ON "public"."doughs" USING "btree" ("lower"("name"));


--
-- Name: idx_batch_results_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_results_batch" ON "public"."batch_results" USING "btree" ("batch_id");


--
-- Name: idx_batches_recipe_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batches_recipe_created" ON "public"."batches" USING "btree" ("recipe_id", "created_at" DESC);


--
-- Name: idx_recipes_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recipes_user_id" ON "public"."recipes" USING "btree" ("user_id");


--
-- Name: ingredients_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ingredients_name_unique" ON "public"."ingredients" USING "btree" ("lower"("name"));


--
-- Name: pizza_ingredients_pizza_stage_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pizza_ingredients_pizza_stage_order" ON "public"."pizza_ingredients" USING "btree" ("pizza_id", "stage", "sort_order");


--
-- Name: pizza_ingredients_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "pizza_ingredients_unique" ON "public"."pizza_ingredients" USING "btree" ("pizza_id", "ingredient_id", "stage");


--
-- Name: pizzas_name_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "pizzas_name_unique" ON "public"."pizzas" USING "btree" ("lower"("name"));


--
-- Name: recipes_user_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "recipes_user_created_idx" ON "public"."recipes" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: doughs trg_doughs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_doughs_updated_at" BEFORE UPDATE ON "public"."doughs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: ingredients trg_ingredients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: pizza_recipes trg_pizza_recipes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_pizza_recipes_updated_at" BEFORE UPDATE ON "public"."pizza_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: pizzas trg_pizzas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_pizzas_updated_at" BEFORE UPDATE ON "public"."pizzas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: recipes trg_recipes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_recipes_updated_at" BEFORE UPDATE ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: recipe_templates trg_templates_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_templates_updated_at" BEFORE UPDATE ON "public"."recipe_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: batch_results batch_results_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_results"
    ADD CONSTRAINT "batch_results_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE CASCADE;


--
-- Name: batch_results batch_results_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_results"
    ADD CONSTRAINT "batch_results_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");


--
-- Name: batch_results batch_results_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_results"
    ADD CONSTRAINT "batch_results_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."recipe_phases"("id");


--
-- Name: batches batches_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batches"
    ADD CONSTRAINT "batches_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id");


--
-- Name: flour_blends flour_blends_flour_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flour_blends"
    ADD CONSTRAINT "flour_blends_flour_ingredient_id_fkey" FOREIGN KEY ("flour_ingredient_id") REFERENCES "public"."ingredients"("id");


--
-- Name: flour_blends flour_blends_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flour_blends"
    ADD CONSTRAINT "flour_blends_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."recipe_phases"("id") ON DELETE CASCADE;


--
-- Name: flour_blends flour_blends_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flour_blends"
    ADD CONSTRAINT "flour_blends_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;


--
-- Name: formula_lines formula_lines_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."formula_lines"
    ADD CONSTRAINT "formula_lines_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");


--
-- Name: formula_lines formula_lines_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."formula_lines"
    ADD CONSTRAINT "formula_lines_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."recipe_phases"("id") ON DELETE CASCADE;


--
-- Name: formula_lines formula_lines_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."formula_lines"
    ADD CONSTRAINT "formula_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;


--
-- Name: pizza_ingredients pizza_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_ingredients"
    ADD CONSTRAINT "pizza_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE RESTRICT;


--
-- Name: pizza_ingredients pizza_ingredients_pizza_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_ingredients"
    ADD CONSTRAINT "pizza_ingredients_pizza_id_fkey" FOREIGN KEY ("pizza_id") REFERENCES "public"."pizza_recipes"("id") ON DELETE CASCADE;


--
-- Name: pizza_recipes pizza_recipes_dough_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_recipes"
    ADD CONSTRAINT "pizza_recipes_dough_recipe_id_fkey" FOREIGN KEY ("dough_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;


--
-- Name: pizza_recipes pizza_recipes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizza_recipes"
    ADD CONSTRAINT "pizza_recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: pizzas pizzas_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizzas"
    ADD CONSTRAINT "pizzas_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;


--
-- Name: pizzas pizzas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pizzas"
    ADD CONSTRAINT "pizzas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: recipe_flours recipe_flours_flour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_flours"
    ADD CONSTRAINT "recipe_flours_flour_id_fkey" FOREIGN KEY ("flour_id") REFERENCES "public"."flours"("id");


--
-- Name: recipe_flours recipe_flours_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_flours"
    ADD CONSTRAINT "recipe_flours_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;


--
-- Name: recipe_ingredients recipe_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");


--
-- Name: recipe_ingredients recipe_ingredients_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;


--
-- Name: recipe_phases recipe_phases_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipe_phases"
    ADD CONSTRAINT "recipe_phases_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;


--
-- Name: recipes recipes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: pizzas Users can manage their pizzas; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their pizzas" ON "public"."pizzas" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: pizza_recipes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pizza_recipes" ENABLE ROW LEVEL SECURITY;

--
-- Name: pizza_recipes pizza_recipes_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pizza_recipes_delete_own" ON "public"."pizza_recipes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: pizza_recipes pizza_recipes_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pizza_recipes_insert_own" ON "public"."pizza_recipes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: pizza_recipes pizza_recipes_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pizza_recipes_select_own" ON "public"."pizza_recipes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: pizza_recipes pizza_recipes_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pizza_recipes_update_own" ON "public"."pizza_recipes" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: pizzas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pizzas" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public_read" ON "public"."recipes" FOR SELECT TO "anon" USING (true);


--
-- Name: recipe_flours; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipe_flours" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_flours recipe_flours_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipe_flours_own" ON "public"."recipe_flours" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_flours"."recipe_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_flours"."recipe_id") AND ("r"."user_id" = "auth"."uid"())))));


--
-- Name: recipe_ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_ingredients recipe_ingredients_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipe_ingredients_own" ON "public"."recipe_ingredients" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recipes" "r"
  WHERE (("r"."id" = "recipe_ingredients"."recipe_id") AND ("r"."user_id" = "auth"."uid"())))));


--
-- Name: recipe_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipe_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes recipes_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_delete_own" ON "public"."recipes" FOR DELETE USING (("user_id" = "auth"."uid"()));


--
-- Name: recipes recipes_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_insert_own" ON "public"."recipes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: recipes recipes_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_select_own" ON "public"."recipes" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: recipes recipes_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "recipes_update_own" ON "public"."recipes" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: recipe_templates templates_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "templates_read_public" ON "public"."recipe_templates" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: TABLE "batch_results"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batch_results" TO "anon";
GRANT ALL ON TABLE "public"."batch_results" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_results" TO "service_role";


--
-- Name: TABLE "batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batches" TO "anon";
GRANT ALL ON TABLE "public"."batches" TO "authenticated";
GRANT ALL ON TABLE "public"."batches" TO "service_role";


--
-- Name: TABLE "doughs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."doughs" TO "anon";
GRANT ALL ON TABLE "public"."doughs" TO "authenticated";
GRANT ALL ON TABLE "public"."doughs" TO "service_role";


--
-- Name: TABLE "flour_blends"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flour_blends" TO "anon";
GRANT ALL ON TABLE "public"."flour_blends" TO "authenticated";
GRANT ALL ON TABLE "public"."flour_blends" TO "service_role";


--
-- Name: TABLE "flours"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flours" TO "anon";
GRANT ALL ON TABLE "public"."flours" TO "authenticated";
GRANT ALL ON TABLE "public"."flours" TO "service_role";


--
-- Name: TABLE "formula_lines"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."formula_lines" TO "anon";
GRANT ALL ON TABLE "public"."formula_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."formula_lines" TO "service_role";


--
-- Name: TABLE "ingredients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";


--
-- Name: TABLE "pizza_ingredients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pizza_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."pizza_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."pizza_ingredients" TO "service_role";


--
-- Name: TABLE "pizza_recipes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pizza_recipes" TO "anon";
GRANT ALL ON TABLE "public"."pizza_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."pizza_recipes" TO "service_role";


--
-- Name: TABLE "pizzas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pizzas" TO "anon";
GRANT ALL ON TABLE "public"."pizzas" TO "authenticated";
GRANT ALL ON TABLE "public"."pizzas" TO "service_role";


--
-- Name: TABLE "recipe_flours"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recipe_flours" TO "anon";
GRANT ALL ON TABLE "public"."recipe_flours" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_flours" TO "service_role";


--
-- Name: TABLE "recipe_ingredients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";


--
-- Name: TABLE "recipe_phases"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recipe_phases" TO "anon";
GRANT ALL ON TABLE "public"."recipe_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_phases" TO "service_role";


--
-- Name: TABLE "recipe_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recipe_templates" TO "anon";
GRANT ALL ON TABLE "public"."recipe_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_templates" TO "service_role";


--
-- Name: TABLE "recipes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict CVXut6lE4OK41l11UmPx01RjevsUiQKoMpayvQUavNyQlj2qZFOT4thTqEE3les

