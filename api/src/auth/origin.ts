import { config } from "../config.js";

const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

const hostMatchesDomain = (host: string, baseDomain: string): boolean =>
  host === baseDomain || host.endsWith(`.${baseDomain}`);

export const isAllowedOrigin = (origin: string | undefined | null): boolean => {
  if (!origin) return false;
  if (isLocalhostOrigin(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();

    for (const domain of config.corsAllowedDomains) {
      if (hostMatchesDomain(host, domain.toLowerCase())) return true;
    }

    if (config.corsAllowNetlifyApp && host.endsWith(".netlify.app")) return true;
    return false;
  } catch {
    return false;
  }
};

export const assertAllowedOrigin = (origin: string | undefined | null): void => {
  if (!isAllowedOrigin(origin)) {
    throw new Error("Origin not allowed.");
  }
};

