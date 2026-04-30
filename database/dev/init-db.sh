#!/usr/bin/env bash
# Postgres initdb hook: creates identity_db and app_db on a fresh cluster.
# Roles are created later by their respective migrations (01_roles.sql for
# identity, 00_platform.sql for app). This script only ensures the databases
# exist so dbctl can connect and apply migrations to each.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
  CREATE DATABASE identity_db;
  CREATE DATABASE app_db;
EOSQL
