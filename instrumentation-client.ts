if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const Sentry = require("@sentry/nextjs")
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  })
}
