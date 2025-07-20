import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { invokeGetTables } from "@/api/db"
import { Icon } from "@iconify/react"

import { Input } from "@/components/ui/input"
import { DbData, TableEntry } from "@/components/types"

interface TableCardProps {
  name: string
  parents: number
  rowsInserted: number
  rows: number
  inserted: boolean
  active: boolean
  onClick: () => void
}

const TableCard = forwardRef<HTMLDivElement, TableCardProps>(
  ({ name, parents, rowsInserted, rows, inserted, active, onClick }, ref) => {
    return (
      <div
        ref={ref}
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
          <Icon
            icon="mdi:minus-circle"
            className="text-grey-500 mr-4 h-6 w-6"
          />
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
          <p className="text-sm text-muted-foreground">
            {parents} parent tables
          </p>
        </div>
        <p className="ml-auto text-sm font-semibold text-muted-foreground">
          {rows !== 1
            ? new Intl.NumberFormat("en", { notation: "compact" }).format(
                rows
              ) + " rows"
            : "1 row"}
        </p>
      </div>
    )
  }
)

interface ListTablesProps {
  dbData: DbData | null
  activeTable: string | null
  setActiveTable: (activeTable: string | null) => void
}

export default function ListTables({
  dbData,
  activeTable,
  setActiveTable,
}: ListTablesProps) {
  const [tableEntries, setTableEntries] = useState<TableEntry[] | null>(null)
  const [availableHeight, setAvailableHeight] = useState("")
  const [search, setSearch] = useState("")

  const ref = useRef<HTMLDivElement>(null)
  const activeTableRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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
    if (!dbData) {
      setTableEntries(null)
      setActiveTable(null)
    } else {
      fetchTables()
    }
  }, [dbData])

  function fetchTables() {
    if (!dbData) {
      setTableEntries(null)
      return
    }

    invokeGetTables()
      .then((res) => {
        console.log("Fetched tables:", res)
        setTableEntries(res)
      })
      .catch((error) => {
        console.error("Error fetching tables:", error)
      })
  }

  useEffect(() => {
    if (activeTableRef.current) {
      activeTableRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
  }, [activeTable])

  useEffect(() => {
    setActiveTable(tableEntries?.[0]?.["name"] || null)
  }, [tableEntries])

  const filteredEntries = useMemo(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
    return tableEntries?.filter((entry) =>
      entry.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [tableEntries, search])

  return (
    <div
      ref={ref}
      className="mr-4 flex min-w-[340px] max-w-[340px] flex-1 flex-col overflow-hidden rounded border p-4"
      style={{ height: availableHeight }}
    >
      <div className="flex h-10 w-full flex-shrink-0 items-center justify-between">
        <h2 className="text-2xl font-semibold">Tables</h2>
        <p className="text-sm font-semibold text-muted-foreground">
          Total: {tableEntries?.length || 0}, filled: 20
        </p>
      </div>

      <Input
        className="mt-4"
        placeholder="Search tables..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div
        className="mt-4 flex-1 space-y-4 overflow-y-auto"
        ref={scrollContainerRef}
      >
        {filteredEntries && filteredEntries.length !== 0 ? (
          filteredEntries.map((tableEntry) => (
            <TableCard
              key={tableEntry.name}
              name={tableEntry.name}
              ref={tableEntry.name === activeTable ? activeTableRef : undefined}
              parents={tableEntry.parents}
              rowsInserted={0}
              rows={tableEntry.rows}
              inserted={false}
              active={tableEntry.name === activeTable}
              onClick={() => setActiveTable(tableEntry.name)}
            />
          ))
        ) : (
          <p className="animate-pulse text-center text-sm font-semibold text-muted-foreground">
            No tables found.
          </p>
        )}
      </div>
    </div>
  )
}
