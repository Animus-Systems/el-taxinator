import { sql, queryOne } from "@/lib/sql"
import type { User, AppData } from "@/lib/db-types"

export const getAppData = async (user: User, app: string) => {
  const appData = await queryOne<AppData>(
    sql`SELECT * FROM app_data WHERE user_id = ${user.id} AND app = ${app}`
  )

  return appData?.data
}

export const setAppData = async (user: User, app: string, data: any) => {
  await queryOne<AppData>(
    sql`INSERT INTO app_data (user_id, app, data)
        VALUES (${user.id}, ${app}, ${JSON.stringify(data)})
        ON CONFLICT (user_id, app)
        DO UPDATE SET data = ${JSON.stringify(data)}
        RETURNING *`
  )
}
