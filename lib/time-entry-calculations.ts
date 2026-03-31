export function calcDurationMinutes(startedAt: Date, endedAt: Date): number {
  return Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)
}

export function calcBillableAmount(durationMinutes: number, hourlyRate: number): number {
  return Math.round((durationMinutes / 60) * hourlyRate)
}
