import { invokeTableData } from "@/api/db"
import { Icon } from "@iconify/react"
import { useEffect, useRef, useState } from "react"

import { DbData, TableData } from "@/components/types"

interface ListTablesProps {
  dbData: DbData | null
  activeTable: string | null
}

export default function InsertionPanel({
  dbData,
  activeTable,
}: ListTablesProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")
  const [tableData, setTableData] = useState<TableData | null>(null)

  useEffect(() => {
    getTimeOfDay()
    function updateSize() {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()

        const spaceBelow = window.innerHeight - rect.top
        setAvailableHeight(spaceBelow - 40 + "px")
        console.log("Available height:", spaceBelow - 40 + "px")

        const spaceRight = window.innerWidth - rect.left
        setAvailableWidth(spaceRight - 40 + "px")
      }
    }

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  useEffect(() => {
    getTableData()
  }, [activeTable])

  function getTimeOfDay() {
    const hour = new Date().getHours()

    setTimeOfDay(() => {
      if (hour >= 5 && hour < 9) return "sunrise"
      if (hour >= 9 && hour < 18) return "sunset"
      if (hour >= 18 && hour < 21) return "moonrise"
      return "moonset"
    })
  }

  function getTableData() {
    if (!dbData || !dbData.connected || !activeTable) {
      setTableData(null)
      return
    }
    invokeTableData(activeTable)
      .then((res: TableData) => {
        setTableData(res as TableData)
      })
      .catch((error) => {
        console.error("Error fetching table data:", error)
        setTableData(null)
      })
  }

  return (
    <div
      ref={ref}
      className="flex flex-col"
      style={{
        height: availableHeight,
        width: availableWidth,
      }}
    >
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
            <p className="mb-4 text-sm font-medium text-muted-foreground">
              Select a table to continue.
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center space-x-2">
              <h2 className="text-2xl font-semibold tracking-wide">
                {activeTable}
              </h2>
              <Icon
                key={activeTable}
                icon="meteocons:smoke-particles"
                className="h-8 w-8 text-muted-foreground"
              />
            </div>
            <p className="mb-4 text-muted-foreground">
              Yaay! You've selected a table
            </p>
          </>
        )}
      </div>
      <div className="flex h-full w-full flex-col space-y-4 rounded border p-4">
        <div className="flex h-full w-full items-center justify-center">
          <Icon
            icon={`meteocons:${timeOfDay}`}
            className="margin-auto h-16 w-16 text-muted-foreground"
          />
        </div>
      </div>
    </div>
  )
}
