import { NextResponse } from "next/server"
import { generateOpenApiDocument } from "trpc-to-openapi"
import { appRouter } from "@/lib/trpc/router"
import config from "@/lib/config"

export function GET() {
  const openApiDocument = generateOpenApiDocument(appRouter, {
    title: `${config.app.title} API`,
    description: config.app.description,
    version: config.app.version,
    baseUrl: `${config.app.baseURL}/api/v1`,
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "taxhacker.session_token",
      },
    },
  })

  return NextResponse.json(openApiDocument)
}
