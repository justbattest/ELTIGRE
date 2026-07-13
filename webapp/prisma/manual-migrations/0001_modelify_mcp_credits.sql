-- ============================================================================
-- Migration manuelle 0001 — Modelify MCP : clés API + crédits
-- ============================================================================
--
-- ⚠️  À APPLIQUER MANUELLEMENT par Yanis sur la base Supabase de PRODUCTION.
--     Cette migration n'est JAMAIS appliquée automatiquement (pas de
--     `prisma db push` / `prisma migrate` sur cette base partagée).
--
-- Garanties : PUREMENT ADDITIF. Aucun DROP, aucun ALTER de table existante,
-- aucune modification de la table `users`. On ne fait que CREATE TABLE +
-- index + FK sortantes vers `users(id)`. Sûr à rejouer (IF NOT EXISTS).
--
-- Comment appliquer (au choix) :
--   • Supabase Studio → SQL Editor → coller ce fichier → Run
--   • psql "$DIRECT_URL" -f prisma/manual-migrations/0001_modelify_mcp_credits.sql
--
-- Les noms de colonnes correspondent au mapping Prisma (@map snake_case) du
-- schema.prisma, afin que le client Prisma généré pointe sur les bonnes colonnes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- api_keys : clés API programmatiques (auth du serveur MCP Modelify)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id"           TEXT        NOT NULL,
    "user_id"      TEXT        NOT NULL,
    "key_hash"     TEXT        NOT NULL,
    "key_prefix"   TEXT        NOT NULL,
    "label"        TEXT,
    "scopes"       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at"   TIMESTAMPTZ(6),
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- Index unique sur le hash = sert aussi d'index de lookup à la vérif de clé.
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "idx_api_keys_user_id" ON "api_keys" ("user_id");

-- FK sortante vers users (la table users n'est PAS modifiée).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_fkey'
    ) THEN
        ALTER TABLE "api_keys"
            ADD CONSTRAINT "api_keys_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- credit_wallets : un solde de crédits par utilisateur (PK = user_id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "credit_wallets" (
    "user_id"    TEXT        NOT NULL,
    "balance"    INTEGER     NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("user_id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'credit_wallets_user_id_fkey'
    ) THEN
        ALTER TABLE "credit_wallets"
            ADD CONSTRAINT "credit_wallets_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- credit_transactions : journal immuable des débits/crédits
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "credit_transactions" (
    "id"            TEXT        NOT NULL,
    "user_id"       TEXT        NOT NULL,
    "delta"         INTEGER     NOT NULL,         -- négatif = débit, positif = crédit
    "reason"        TEXT        NOT NULL,
    "run_id"        TEXT,                          -- lie un débit à runs.id (nullable)
    "balance_after" INTEGER     NOT NULL,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_credit_transactions_user_id" ON "credit_transactions" ("user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_user_id_fkey'
    ) THEN
        ALTER TABLE "credit_transactions"
            ADD CONSTRAINT "credit_transactions_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- ============================================================================
-- Fin migration 0001
-- ============================================================================
