import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { buildPublicApiOpenApiDocument } from "../openapiDocument.js";

// Generates two artefacts on every build:
//   * api/openapi/{openapi.json, types.ts} — checked-in copies the
//     `yarn check:contracts` task uses to detect drift between the runtime
//     router shape and what consumers expect.
//   * packages/api-types/{openapi.json, index.d.ts} — what the UI repo
//     consumes via the @animus-systems/taxinator-api-types alias. Same
//     bytes, different mount point. Keeping both in sync is the whole
//     point of the script.

async function main(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const apiOutDir = path.resolve(__dirname, "../../openapi");
  const apiOpenApiPath = path.join(apiOutDir, "openapi.json");
  const apiTypesPath = path.join(apiOutDir, "types.ts");
  const repoRoot = path.resolve(__dirname, "../../../");
  const packageDir = path.join(repoRoot, "packages", "api-types");
  const packageTypesPath = path.join(packageDir, "index.d.ts");
  const packageOpenApiPath = path.join(packageDir, "openapi.json");

  const baseUrl = process.env["BASE_URL"] ?? "http://localhost:4000";
  const openApiDoc = buildPublicApiOpenApiDocument(baseUrl);

  await mkdir(apiOutDir, { recursive: true });
  await mkdir(packageDir, { recursive: true });
  const openApiJson = `${JSON.stringify(openApiDoc, null, 2)}\n`;
  await writeFile(apiOpenApiPath, openApiJson, "utf8");
  await writeFile(packageOpenApiPath, openApiJson, "utf8");

  const ast = await openapiTS(Buffer.from(openApiJson, "utf8"));
  const types = astToString(ast);
  const header =
    "// Generated from api/openapi/openapi.json by `yarn generate:types`.\n"
    + "// Do not edit manually.\n\n";
  const typeFile = `${header}${types}`;
  await writeFile(apiTypesPath, typeFile, "utf8");
  await writeFile(packageTypesPath, typeFile, "utf8");

  console.log(`OpenAPI document → ${apiOpenApiPath}`);
  console.log(`Type definitions → ${apiTypesPath}`);
  console.log(`Package OpenAPI  → ${packageOpenApiPath}`);
  console.log(`Package types    → ${packageTypesPath}`);
}

main().catch((error) => {
  console.error("Failed to generate OpenAPI artefacts.", error);
  process.exit(1);
});
