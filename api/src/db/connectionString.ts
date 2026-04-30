const SSL_QUERY_PARAMS = [
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslcrl",
  "sslpassword",
  "sslaccept",
  "sslinline",
  "uselibpqcompat",
];

/**
 * When pg receives both explicit `ssl` config and SSL query params in the connection string,
 * query params can override or conflict with TLS options (e.g. CA verification).
 * We strip SSL query params so runtime TLS is controlled solely by explicit ssl config.
 */
export const sanitizeConnectionStringForExplicitSsl = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    let changed = false;
    for (const key of SSL_QUERY_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : connectionString;
  } catch {
    return connectionString;
  }
};
