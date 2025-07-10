import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { invoke } from "@tauri-apps/api/core"

import { DbInfo, Response } from "@/components/types"

interface TableCardProps {
  name: string
  parents: number
  rowsInserted: number
  rows: number
  inserted: boolean
  active: boolean
  onClick: () => void
}

function TableCard({
  name,
  parents,
  rowsInserted,
  rows,
  inserted,
  active,
  onClick,
}: TableCardProps) {
  return (
    <div
      className={
        "flex w-full items-center rounded border p-4 hover:bg-accent hover:text-accent-foreground" +
        (active ? " bg-accent text-accent-foreground" : "")
      }
      onClick={onClick}
      role="button"
    >
      {inserted ? (
        <Icon
          icon="material-symbols:check-circle-rounded"
          className="mr-4 h-6 w-6 text-green-500"
        />
      ) : (
        <Icon icon="mdi:minus-circle" className="text-grey-500 mr-4 h-6 w-6" />
      )}
      <div>
        <div className="flex w-40 items-center">
          <h3 className="truncate font-semibold tracking-wider">{name}</h3>
          {inserted && (
            <p className="ml-2 text-sm font-bold text-green-500">
              +{rowsInserted}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{parents} parent tables</p>
      </div>
      <p className="ml-auto text-sm font-semibold text-muted-foreground">
        {rows !== 1
          ? new Intl.NumberFormat("en", { notation: "compact" }).format(rows) +
            " rows"
          : "1 row"}
      </p>
    </div>
  )
}

interface TableEntry {
  parents: number
  rows: number
}

interface TableInfo {
  sortedTables: string[]
  tableData: Record<string, TableEntry>
}
interface ListTablesProps {
  dbInfo: DbInfo | null
  activeTable: string | null
  setActiveTable: (activeTable: string | null) => void
}

export default function ListTables({
  dbInfo,
  activeTable,
  setActiveTable,
}: ListTablesProps) {
  const [tableData, setTableData] = useState<TableInfo | null>(null)
  const [availableHeight, setAvailableHeight] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function updateHeight() {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.top
        setAvailableHeight(spaceBelow - 40 + "px")
      }
    }

    updateHeight()
    window.addEventListener("resize", updateHeight)
    return () => window.removeEventListener("resize", updateHeight)
  }, [])

  useEffect(() => {
    if (!dbInfo) {
      console.log("dbInfo changed:", dbInfo)
      setTableData(null)
      setActiveTable(null)
    }
  }, [dbInfo])

  function fetchTables() {
    if (!dbInfo || !dbInfo.connected) {
      setTableData(null)
      return
    }

    invoke<string>("send", {
      payload: JSON.stringify({
        kind: "get_tables",
      }),
    })
      .then((unParsedResponse: string) => {
        const res = JSON.parse(unParsedResponse) as Response<any>
        if (res.status === "ok") {
          console.log("Tables fetched successfully:")
          setTableData(() => {
            const raw = res.payload
            const formatted: TableInfo = {
              sortedTables: raw.sorted_tables,
              tableData: raw.table_data,
            }
            return formatted
          })
        } else {
          console.error("Error fetching tables:", res.error)
        }
      })
      .catch((error) => {
        console.error("Error invoking get_tables:", error)
      })
  }

  useEffect(() => {
    fetchTables()
  }, [dbInfo])

  return (
    <div
      ref={ref}
      className="mr-4 flex min-w-[340px] max-w-[340px] flex-1 flex-col overflow-hidden rounded border p-4"
      style={{ height: availableHeight }}
    >
      <div className="flex h-10 w-full flex-shrink-0 items-center justify-between">
        <h2 className="text-2xl font-semibold">Tables</h2>
        <p className="text-sm font-semibold text-muted-foreground">
          Total: {tableData?.sortedTables.length || 0}, filled: 20
        </p>
      </div>
      <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
        {tableData && tableData.sortedTables.length !== 0 ? (
          tableData.sortedTables.map((tableName) => {
            const entry = tableData?.tableData[tableName] as TableEntry
            return (
              <TableCard
                key={tableName}
                name={tableName}
                parents={entry.parents}
                rowsInserted={0}
                rows={entry.rows || 1999}
                inserted={false}
                active={tableName === activeTable}
                onClick={() => {
                  setActiveTable(tableName)
                }}
              />
            )
          })
        ) : (
          <p className="animate-pulse text-center text-sm font-semibold text-muted-foreground">
            {tableData && tableData.sortedTables.length === 0
              ? "Empty database."
              : "Connect to a database."}
          </p>
        )}
      </div>
    </div>
  )
}
