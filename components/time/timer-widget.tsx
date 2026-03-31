"use client"

import { createTimeEntryAction } from "@/app/(app)/time/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Client, Project } from "@/prisma/client"
import { CircleStop, Play } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

type Props = {
  projects: Project[]
  clients: Client[]
}

const STORAGE_KEY = "taxinator_active_timer"

type ActiveTimer = {
  startedAt: string
  description: string
  projectCode: string
  clientId: string
}

export function TimerWidget({ projects, clients }: Props) {
  const [active, setActive] = useState<ActiveTimer | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [description, setDescription] = useState("")
  const [projectCode, setProjectCode] = useState("")
  const [clientId, setClientId] = useState("")
  const [isPending, startTransition] = useTransition()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const timer: ActiveTimer = JSON.parse(stored)
        setActive(timer)
        setDescription(timer.description)
        setProjectCode(timer.projectCode)
        setClientId(timer.clientId)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    if (active) {
      const tick = () => {
        const ms = Date.now() - new Date(active.startedAt).getTime()
        setElapsed(Math.floor(ms / 1000))
      }
      tick()
      intervalRef.current = setInterval(tick, 1000)
    } else {
      setElapsed(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active])

  function startTimer() {
    const timer: ActiveTimer = {
      startedAt: new Date().toISOString(),
      description,
      projectCode,
      clientId,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
    setActive(timer)
  }

  function stopTimer() {
    if (!active) return
    const endedAt = new Date()
    const startedAt = new Date(active.startedAt)

    localStorage.removeItem(STORAGE_KEY)
    setActive(null)

    const formData = new FormData()
    formData.set("description", active.description)
    formData.set("projectCode", active.projectCode)
    formData.set("clientId", active.clientId)
    formData.set("startedAt", startedAt.toISOString())
    formData.set("endedAt", endedAt.toISOString())
    formData.set("isBillable", "true")

    startTransition(async () => {
      const result = await createTimeEntryAction(null, formData)
      if (result.success) {
        toast.success("Time entry saved")
        setDescription("")
        setProjectCode("")
        setClientId("")
      } else {
        toast.error(result.error || "Failed to save time entry")
      }
    })
  }

  function formatElapsed(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":")
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor="timer-desc">What are you working on?</Label>
          <Input
            id="timer-desc"
            placeholder="Description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!!active}
          />
        </div>
        <div className="w-40 space-y-1">
          <Label>Project</Label>
          <Select value={projectCode || "__none__"} onValueChange={(v) => setProjectCode(v === "__none__" ? "" : v)} disabled={!!active}>
            <SelectTrigger>
              <SelectValue placeholder="Project..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1">
          <Label>Client</Label>
          <Select value={clientId || "__none__"} onValueChange={(v) => setClientId(v === "__none__" ? "" : v)} disabled={!!active}>
            <SelectTrigger>
              <SelectValue placeholder="Client..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {active && (
          <div className="font-mono text-2xl font-semibold tabular-nums min-w-[90px]">
            {formatElapsed(elapsed)}
          </div>
        )}
        {active ? (
          <Button variant="destructive" onClick={stopTimer} disabled={isPending}>
            <CircleStop className="h-4 w-4 mr-1" /> Stop
          </Button>
        ) : (
          <Button onClick={startTimer}>
            <Play className="h-4 w-4 mr-1" /> Start Timer
          </Button>
        )}
      </div>
    </div>
  )
}
