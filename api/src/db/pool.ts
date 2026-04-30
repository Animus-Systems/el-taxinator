import pg from "pg";
import { config, makeSslConfig } from "../config.js";
import { sanitizeConnectionStringForExplicitSsl } from "./connectionString.js";

type SslConfig = { rejectUnauthorized: boolean; ca?: string };
type PgTypesApi = {
  builtins: { DATE: number; TIMESTAMP: number; TIMESTAMPTZ: number };
  setTypeParser: (oid: number, parser: (value: string) => string) => void;
};
const { Pool } = pg;
const resolvePgTypes = (value: unknown): PgTypesApi => {
  if (typeof value !== "object" || value === null) {
    throw new Error("pg module did not expose a types registry");
  }
  const maybeTypes = Reflect.get(value, "types");
  if (typeof maybeTypes !== "object" || maybeTypes === null) {
    throw new Error("pg module did not expose a valid types registry");
  }
  const builtins = Reflect.get(maybeTypes, "builtins");
  const setTypeParser = Reflect.get(maybeTypes, "setTypeParser");
  if (
    typeof builtins !== "object"
    || builtins === null
    || typeof Reflect.get(builtins, "DATE") !== "number"
    || typeof Reflect.get(builtins, "TIMESTAMP") !== "number"
    || typeof Reflect.get(builtins, "TIMESTAMPTZ") !== "number"
    || typeof setTypeParser !== "function"
  ) {
    throw new Error("pg module types registry was missing required temporal parsers");
  }
  return {
    builtins: {
      DATE: Reflect.get(builtins, "DATE") as number,
      TIMESTAMP: Reflect.get(builtins, "TIMESTAMP") as number,
      TIMESTAMPTZ: Reflect.get(builtins, "TIMESTAMPTZ") as number,
    },
    setTypeParser: setTypeParser as PgTypesApi["setTypeParser"],
  };
};
const types = resolvePgTypes(pg);

// Keep temporal values as raw DB text so API schemas can return ISO-like strings consistently.
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value: string) => value);

const appPoolConfig: { connectionString: string; ssl?: SslConfig } = {
  connectionString: config.appDbUrl,
};
if (config.appDbSsl) {
  appPoolConfig.connectionString = sanitizeConnectionStringForExplicitSsl(appPoolConfig.connectionString);
  appPoolConfig.ssl = makeSslConfig(true);
}
export const appPool = new Pool(appPoolConfig);

const identityPoolConfig: { connectionString: string; ssl?: SslConfig } = {
  connectionString: config.identityDbUrl,
};
if (config.identityDbSsl) {
  identityPoolConfig.connectionString = sanitizeConnectionStringForExplicitSsl(identityPoolConfig.connectionString);
  identityPoolConfig.ssl = makeSslConfig(true);
}
export const identityPool = new Pool(identityPoolConfig);

export const appAdminPool = config.appDbAdminUrl
  ? (() => {
      const cfg: { connectionString: string; ssl?: SslConfig } = {
        connectionString: config.appDbAdminUrl,
      };
      if (config.appDbSsl) {
        cfg.connectionString = sanitizeConnectionStringForExplicitSsl(cfg.connectionString);
        cfg.ssl = makeSslConfig(true);
      }
      return new Pool(cfg);
    })()
  : undefined;

export const identityAdminPool = config.identityDbAdminUrl
  ? (() => {
      const cfg: { connectionString: string; ssl?: SslConfig } = {
        connectionString: config.identityDbAdminUrl,
      };
      if (config.identityDbSsl) {
        cfg.connectionString = sanitizeConnectionStringForExplicitSsl(cfg.connectionString);
        cfg.ssl = makeSslConfig(true);
      }
      return new Pool(cfg);
    })()
  : undefined;
