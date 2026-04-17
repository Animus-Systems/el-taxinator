
import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { ChevronProps, DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const ChevronIcon = ({ className, orientation = "right", size = 16 }: ChevronProps) => {
    const Icon =
      orientation === "left"
        ? ChevronLeft
        : orientation === "up"
          ? ChevronUp
          : orientation === "down"
            ? ChevronDown
            : ChevronRight

    return <Icon className={cn("h-4 w-4", className)} size={size} />
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row sm:gap-4",
        month: "flex flex-col gap-2",
        month_caption: "flex h-8 items-center justify-center relative",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1 absolute left-0 right-0 top-0 h-8 justify-between px-1 z-10",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem] text-center",
        week: "flex w-full mt-1",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 w-8 h-8",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
        ),
        range_start: "rounded-l-md bg-primary/20",
        range_end: "rounded-r-md bg-primary/20",
        range_middle: "bg-accent aria-selected:bg-accent aria-selected:text-accent-foreground",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside:
          "text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ChevronIcon,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
