import { prisma } from "@/lib/db"
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  DEFAULT_FIELDS,
  DEFAULT_PROJECTS,
  DEFAULT_SETTINGS,
} from "./defaults"

export async function createUserDefaults(userId: string) {
  for (const project of DEFAULT_PROJECTS) {
    await prisma.project.upsert({
      where: { userId_code: { code: project.code, userId } },
      update: { name: project.name, color: project.color, llm_prompt: project.llm_prompt },
      create: { ...project, userId },
    })
  }

  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_code: { code: category.code, userId } },
      update: { name: category.name, color: category.color, llm_prompt: category.llm_prompt },
      create: { ...category, userId },
    })
  }

  for (const currency of DEFAULT_CURRENCIES) {
    await prisma.currency.upsert({
      where: { userId_code: { code: currency.code, userId } },
      update: { name: currency.name },
      create: { ...currency, userId },
    })
  }

  for (const field of DEFAULT_FIELDS) {
    await prisma.field.upsert({
      where: { userId_code: { code: field.code, userId } },
      update: {
        name: field.name,
        type: field.type,
        llm_prompt: field.llm_prompt,
        isVisibleInList: field.isVisibleInList,
        isVisibleInAnalysis: field.isVisibleInAnalysis,
        isRequired: field.isRequired,
        isExtra: field.isExtra,
      },
      create: { ...field, userId },
    })
  }

  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { userId_code: { code: setting.code, userId } },
      update: { name: setting.name, description: setting.description, value: setting.value },
      create: { ...setting, userId },
    })
  }
}

export async function isDatabaseEmpty(userId: string) {
  const fieldsCount = await prisma.field.count({ where: { userId } })
  return fieldsCount === 0
}
