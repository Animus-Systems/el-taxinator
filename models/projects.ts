import { sql, queryMany, queryOne, buildInsert, buildUpdate, execute } from "@/lib/sql"
import { codeFromName } from "@/lib/utils"
import type { Project } from "@/lib/db-types"
import { cache } from "react"

export type ProjectData = {
  [key: string]: unknown
}

export const getProjects = cache(async (userId: string) => {
  return queryMany<Project>(
    sql`SELECT * FROM projects WHERE user_id = ${userId} ORDER BY name ASC`
  )
})

export const getProjectByCode = cache(async (userId: string, code: string) => {
  return queryOne<Project>(
    sql`SELECT * FROM projects WHERE user_id = ${userId} AND code = ${code}`
  )
})

export const createProject = async (userId: string, project: ProjectData) => {
  if (!project.code) {
    project.code = codeFromName(project.name as string)
  }
  return queryOne<Project>(
    buildInsert("projects", { ...project, userId })
  )
}

export const updateProject = async (userId: string, code: string, project: ProjectData) => {
  return queryOne<Project>(
    buildUpdate("projects", project, "user_id = $1 AND code = $2", [userId, code])
  )
}

export const deleteProject = async (userId: string, code: string) => {
  // Set project_code to null on related transactions
  await execute(
    sql`UPDATE transactions SET project_code = NULL WHERE user_id = ${userId} AND project_code = ${code}`
  )

  return queryOne<Project>(
    sql`DELETE FROM projects WHERE user_id = ${userId} AND code = ${code} RETURNING *`
  )
}
