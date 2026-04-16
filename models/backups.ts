import { getPool } from "@/lib/pg"
import { buildInsert, mapRow } from "@/lib/sql"

type BackupSetting = {
  filename: string
  tableName: string
  backup: (_userId: string, row: any) => Record<string, any>
  restore: (userId: string, json: Record<string, any>) => Record<string, any>
}

// Ordering is important here
export const MODEL_BACKUP: BackupSetting[] = [
  {
    filename: "settings.json",
    tableName: "settings",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        value: row.value,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        code: json.code,
        name: json.name,
        description: json.description,
        value: json.value,
        userId,
      }
    },
  },
  {
    filename: "currencies.json",
    tableName: "currencies",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        code: json.code,
        name: json.name,
        userId,
      }
    },
  },
  {
    filename: "categories.json",
    tableName: "categories",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        color: row.color,
        llmPrompt: row.llmPrompt,
        createdAt: row.createdAt,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        code: json.code,
        name: json.name,
        color: json.color,
        llmPrompt: json.llm_prompt ?? json.llmPrompt,
        createdAt: json.createdAt,
        userId,
      }
    },
  },
  {
    filename: "projects.json",
    tableName: "projects",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        color: row.color,
        llmPrompt: row.llmPrompt,
        createdAt: row.createdAt,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        code: json.code,
        name: json.name,
        color: json.color,
        llmPrompt: json.llm_prompt ?? json.llmPrompt,
        createdAt: json.createdAt,
        userId,
      }
    },
  },
  {
    filename: "fields.json",
    tableName: "fields",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        llmPrompt: row.llmPrompt,
        options: row.options,
        isVisibleInList: row.isVisibleInList,
        isVisibleInAnalysis: row.isVisibleInAnalysis,
        isRequired: row.isRequired,
        isExtra: row.isExtra,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        code: json.code,
        name: json.name,
        type: json.type,
        llmPrompt: json.llm_prompt ?? json.llmPrompt,
        options: json.options,
        isVisibleInList: json.isVisibleInList,
        isVisibleInAnalysis: json.isVisibleInAnalysis,
        isRequired: json.isRequired,
        isExtra: json.isExtra,
        userId,
      }
    },
  },
  {
    filename: "files.json",
    tableName: "files",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        filename: row.filename,
        path: row.path,
        metadata: row.metadata,
        isReviewed: row.isReviewed,
        mimetype: row.mimetype,
        createdAt: row.createdAt,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        id: json.id,
        filename: json.filename,
        path: json.path ? json.path.replace(/^.*\/uploads\//, "") : "",
        metadata: json.metadata,
        isReviewed: json.isReviewed,
        mimetype: json.mimetype,
        userId,
      }
    },
  },
  {
    filename: "transactions.json",
    tableName: "transactions",
    backup: (_userId: string, row: any) => {
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        merchant: row.merchant,
        total: row.total,
        currencyCode: row.currencyCode,
        convertedTotal: row.convertedTotal,
        convertedCurrencyCode: row.convertedCurrencyCode,
        type: row.type,
        note: row.note,
        files: row.files,
        extra: row.extra,
        categoryCode: row.categoryCode,
        projectCode: row.projectCode,
        issuedAt: row.issuedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        text: row.text,
      }
    },
    restore: (userId: string, json: any) => {
      return {
        id: json.id,
        name: json.name,
        description: json.description,
        merchant: json.merchant,
        total: json.total,
        currencyCode: json.currencyCode,
        convertedTotal: json.convertedTotal,
        convertedCurrencyCode: json.convertedCurrencyCode,
        type: json.type,
        note: json.note,
        files: json.files,
        extra: json.extra,
        issuedAt: json.issuedAt,
        categoryCode: json.categoryCode,
        projectCode: json.projectCode,
        userId,
      }
    },
  },
]

const SAFE_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export async function modelToJSON(userId: string, backupSettings: BackupSetting): Promise<string> {
  const pool = await getPool()
  if (!SAFE_TABLE_NAME.test(backupSettings.tableName)) {
    throw new Error(`Unsafe table name: ${backupSettings.tableName}`)
  }
  const result = await pool.query(
    `SELECT * FROM ${backupSettings.tableName} WHERE user_id = $1`,
    [userId],
  )

  if (!result.rows || result.rows.length === 0) {
    return "[]"
  }

  const data = result.rows.map((row) => mapRow<Record<string, any>>(row))

  return JSON.stringify(
    data.map((row: any) => backupSettings.backup(userId, row)),
    null,
    2,
  )
}

export async function modelFromJSON(
  userId: string,
  backupSettings: BackupSetting,
  jsonContent: string,
): Promise<number> {
  const pool = await getPool()
  if (!jsonContent) return 0

  try {
    const records = JSON.parse(jsonContent)

    if (!records || records.length === 0) {
      return 0
    }

    let insertedCount = 0
    for (const rawRecord of records) {
      const record = preprocessRowData(rawRecord)

      try {
        const data = backupSettings.restore(userId, record)
        const insertQuery = buildInsert(backupSettings.tableName, data)
        await pool.query(insertQuery.text, insertQuery.values)
        insertedCount++
      } catch (error) {
        console.error(`Error importing record:`, error)
      }
    }

    return insertedCount
  } catch (error) {
    console.error(`Error parsing JSON content:`, error)
    return 0
  }
}

function preprocessRowData(row: Record<string, any>): Record<string, any> {
  const processedRow: Record<string, any> = {}

  for (const [key, value] of Object.entries(row)) {
    if (value === "" || value === "null" || value === undefined) {
      processedRow[key] = null
      continue
    }

    // Try to parse JSON for object fields
    if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
      try {
        processedRow[key] = JSON.parse(value)
        continue
      } catch (e) {
        // Not valid JSON, continue with normal processing
      }
    }

    // Handle dates (checking for ISO date format)
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
      processedRow[key] = new Date(value)
      continue
    }

    // Handle numbers
    if (typeof value === "string" && !isNaN(Number(value)) && key !== "id" && !key.endsWith("Code")) {
      // Convert numbers but preserving string IDs
      processedRow[key] = Number(value)
      continue
    }

    // Default: keep as is
    processedRow[key] = value
  }

  return processedRow
}
