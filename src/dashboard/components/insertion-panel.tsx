import { get } from "http"
import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { set } from "date-fns"

import { DbInfo } from "@/components/types"

interface ListTablesProps {
  dbInfo: DbInfo | null
  activeTable: string | null
}

export default function InsertionPanel({
  dbInfo,
  activeTable,
}: ListTablesProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")

  useEffect(() => {
    getTimeOfDay()
    function updateSize() {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()

        const spaceBelow = window.innerHeight - rect.top
        setAvailableHeight(spaceBelow - 40 + "px")

        const spaceRight = window.innerWidth - rect.left
        setAvailableWidth(spaceRight - 40 + "px")
      }
    }

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  function getTimeOfDay() {
    const hour = new Date().getHours()

    setTimeOfDay(() => {
      if (hour >= 5 && hour < 9) return "sunrise"
      if (hour >= 9 && hour < 18) return "sunset"
      if (hour >= 18 && hour < 21) return "moonrise"
      return "moonset"
    })
  }

  return (
    <div>
      <div>
        {!activeTable ? (
          <>
            <div className="mb-4 flex items-center space-x-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Icon
                  key={i}
                  icon="meteocons:dust-wind"
                  className="h-8 w-8 text-muted-foreground"
                />
              ))}
            </div>
            <p className="mb-4 text-muted-foreground">
              Select a table to continue.
            </p>
          </>
        ) : (
          <>
            <h2 className="mb-4 text-2xl font-semibold tracking-wide">
              {activeTable}
            </h2>
            <p className="mb-4 text-muted-foreground">
              Yaay! You've selected a table
            </p>
          </>
        )}
      </div>
      <div
        ref={ref}
        className="flex w-full flex-col space-y-4 rounded-lg border p-4"
        style={{
          height: availableHeight,
          width: availableWidth,
        }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <Icon
            icon={`meteocons:${timeOfDay}-fill`}
            className="margin-auto h-16 w-16 text-muted-foreground"
          />
        </div>
      </div>
    </div>
  )
}
