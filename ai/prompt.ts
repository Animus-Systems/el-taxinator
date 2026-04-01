import type { Category, Field, Project } from "@/lib/db-types"

export function buildLLMPrompt(
  promptTemplate: string,
  fields: Field[],
  categories: Category[] = [],
  projects: Project[] = []
) {
  let prompt = promptTemplate

  prompt = prompt.replace(
    "{fields}",
    fields
      .filter((field) => field.llmPrompt)
      .map((field) => `- ${field.code}: ${field.llmPrompt}`)
      .join("\n")
  )

  prompt = prompt.replace(
    "{categories}",
    categories
      .filter((category) => category.llmPrompt)
      .map((category) => `- ${category.code}: for ${category.llmPrompt}`)
      .join("\n")
  )

  prompt = prompt.replace(
    "{projects}",
    projects
      .filter((project) => project.llmPrompt)
      .map((project) => `- ${project.code}: for ${project.llmPrompt}`)
      .join("\n")
  )

  prompt = prompt.replace("{categories.code}", categories.map((category) => `${category.code}`).join(", "))
  prompt = prompt.replace("{projects.code}", projects.map((project) => `${project.code}`).join(", "))

  return prompt
}
