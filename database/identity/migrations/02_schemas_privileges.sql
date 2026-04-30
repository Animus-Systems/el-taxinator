-- Identity DB bootstrap: schemas + baseline privilege hardening
-- Source: database-design-identity-v2.0.1-2026-02-05.txt (§4.3, §14.2.3)

BEGIN;

CREATE SCHEMA IF NOT EXISTS iam AUTHORIZATION identity_owner;
ALTER SCHEMA iam OWNER TO identity_owner;

CREATE SCHEMA IF NOT EXISTS oidc AUTHORIZATION identity_owner;
ALTER SCHEMA oidc OWNER TO identity_owner;

CREATE SCHEMA IF NOT EXISTS ops AUTHORIZATION identity_owner;
ALTER SCHEMA ops OWNER TO identity_owner;

CREATE SCHEMA IF NOT EXISTS admin AUTHORIZATION identity_owner;
ALTER SCHEMA admin OWNER TO identity_owner;

-- Default deny: remove accidental PUBLIC access.
REVOKE ALL ON SCHEMA iam, oidc, ops, admin FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA iam, oidc, ops, admin FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA iam, oidc, ops, admin FROM PUBLIC;

-- Schema usage for application/migrator roles (object-level grants are handled per migration).
GRANT USAGE ON SCHEMA iam, oidc, ops TO identity_app, identity_migrator, identity_breakglass;
GRANT USAGE ON SCHEMA admin TO identity_migrator, identity_breakglass;

-- Prevent default EXECUTE-on-functions to PUBLIC (Postgres default).
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA iam REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA oidc REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA ops REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA admin REVOKE ALL ON FUNCTIONS FROM PUBLIC;

COMMIT;
