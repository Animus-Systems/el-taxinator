-- Identity DB: privilege hardening for public schema
--
-- Postgres defaults allow any role to CREATE in schema "public" via the implicit PUBLIC grant.
-- That is dangerous for security (object injection) and should be disabled in production.
--
-- Note: extensions may place objects in "public". Revoking CREATE does not affect usage.

BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

COMMIT;

