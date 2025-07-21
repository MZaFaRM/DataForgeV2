import { act, useEffect, useRef, useState } from "react"
import {
  invokeDbCommit,
  invokeDbRollback,
  invokeRunSql,
  invokeTableData,
} from "@/api/db"
import {
  invokeGetFakerMethods,
  invokeLoadSpec,
  invokeVerifySpec,
} from "@/api/fill"
import InsertTab from "@/dashboard/components/ui/insert-tab"
import RenderLogs from "@/dashboard/components/ui/log-tab"
import RenderPreview from "@/dashboard/components/ui/preview-tab"
import { sql } from "@codemirror/lang-sql"
import { Icon } from "@iconify/react"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { set } from "date-fns"
import { ta } from "date-fns/locale"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody } from "@/components/ui/table"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import {
  ColumnSpec,
  ColumnSpecMap,
  DataPackage,
  DBCreds,
  TableMetadata,
  TablePacket,
  TableSpec,
  TableSpecEntry,
  TableSpecMap,
} from "@/components/types"

import SqlInsertionTab from "./ui/sql-tab"

interface InsertionPanelProps {
  dbCreds: DBCreds | null
  activeTable: string | null
  setActiveTable: (activeTable: string | null) => void
}

export default function InsertionPanel({
  dbCreds,
  activeTable,
  setActiveTable,
}: InsertionPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const insertTabRef = useRef<HTMLDivElement>(null)
  const previewTabRef = useRef<HTMLDivElement>(null)
  const logTabRef = useRef<HTMLDivElement>(null)

  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")
  const [tableData, setTableData] = useState<TableMetadata | null>(null)
  const [activeTab, setActiveTab] = useState<string>("insert")
  const [globalSpecs, setGlobalSpecs] = useState<TableSpecMap>({})
  const [tableSpecs, setTableSpecs] = useState<TableSpecEntry | null>(null)
  const [tablePacket, setTablePacket] = useState<TablePacket | null>(null)
  const [pendingWrites, setPendingWrites] = useState<number>(0)
  const [needsRefresh, setNeedsRefresh] = useState<boolean>(false)

  useEffect(() => {
    getTimeOfDay()
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  useEffect(() => {
    if (needsRefresh && activeTab == "preview") {
      handleVerifyTableSpec()
    }
  }, [needsRefresh])

  useEffect(() => {
    setNeedsRefresh(true)
  }, [tableSpecs])

  useEffect(() => {
    setActiveTab("insert")
    saveTableSpecs()
    fetchActiveTableData()

    insertTabRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    })
    previewTabRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    })
    logTabRef.current?.scrollTo({
      top: logTabRef.current.scrollHeight,
      left: 0,
      behavior: "auto",
    })
  }, [activeTable, dbCreds])

  useEffect(() => {
    if (activeTab === "preview" && !tablePacket) {
      handleVerifyTableSpec()
      return
    }
  }, [activeTab])

  async function fetchActiveTableData() {
    if (!dbCreds || !dbCreds.id || !activeTable) {
      setTableData(null)
      return
    }

    try {
      const table = await invokeTableData(activeTable)
      if (!table) {
        setTableData(null)
        return
      }
      setTableData(table)
      loadTableSpecs(table)
    } catch (err) {
      console.error("Error fetching table data:", err)
      setTableData(null)
      return null
    }
  }

  function saveTableSpecs() {
    if (!tableSpecs) return

    setGlobalSpecs((prev) => {
      return {
        ...prev,
        [tableSpecs.name]: {
          ...tableSpecs,
        },
      }
    })
  }

  function loadTableSpecs(tbl: TableMetadata | null = null) {
    const table = tbl || tableData
    if (!table) return

    let ts: TableSpecEntry = {
      name: table.name,
      noOfEntries: 50,
      columns: table.columns.reduce((acc, col) => {
        acc[col.name] = {
          name: col.name,
          generator: null,
          type: "faker",
        }
        return acc
      }, {} as ColumnSpecMap),
    }

    if (!!globalSpecs[table.name]) {
      ts = globalSpecs[table.name]
    } else if (dbCreds?.id) {
      invokeLoadSpec(dbCreds.id, table.name).then((spec) => {
        console.log(spec)
        if (!spec) return
        ts.noOfEntries = spec.noOfEntries
        ts.columns = spec.columns.reduce((acc, col) => {
          acc[col.name] = col
          return acc
        }, {} as ColumnSpecMap)
      })
    }
    setTableSpecs(ts)
  }

  function updateSize() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()

      const spaceBelow = window.innerHeight - rect.top
      setAvailableHeight(spaceBelow - 40 + "px")

      const spaceRight = window.innerWidth - rect.left
      setAvailableWidth(spaceRight - 40 + "px")
    }
  }

  function handleVerifyTableSpec() {
    if (!activeTable) return

    const tableSpec: TableSpec = {
      name: activeTable,
      noOfEntries: tableSpecs?.noOfEntries || 50,
      columns: Object.values(tableSpecs?.columns!) as ColumnSpec[],
    }
    console.log("Verifying table spec:", tableSpec)
    invokeVerifySpec(tableSpec)
      .then((res) => {
        setTablePacket(res)
      })
      .catch((error) => {
        console.error("Error verifying spec:", error)
      })

    previewTabRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    })
  }

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
    <TooltipProvider>
      <Toaster />
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
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center space-x-2">
                  <h2 className="text-2xl font-semibold tracking-wide">
                    {tableData?.name || "Loading..."}
                  </h2>
                  <Icon
                    key={activeTable}
                    icon="meteocons:smoke-particles"
                    className="h-8 w-8 text-muted-foreground"
                  />
                </div>
                <div>
                  <div className="mb-2 flex gap-2">
                    <Icon
                      icon="carbon:parent-node"
                      className="h-4 w-4 text-muted-foreground"
                    />
                    {tableData?.parents && tableData.parents.length > 0 ? (
                      tableData.parents.map((parent) => (
                        <Badge
                          key={parent}
                          variant="outline"
                          className="cursor-pointer font-medium hover:bg-muted-foreground hover:text-slate-300"
                          onClick={() => setActiveTable(parent)}
                          title="Parent Table"
                        >
                          {parent}
                        </Badge>
                      ))
                    ) : (
                      <Badge
                        variant="outline"
                        className="cursor-not-allowed bg-muted font-medium"
                      >
                        Orphan
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <HandleTransaction
                  pendingWrites={pendingWrites}
                  setPendingWrites={setPendingWrites}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-end">
          <div className="ml-auto flex items-center rounded text-sm font-medium">
            <TabButton
              label="Script"
              icon="gravity-ui:abbr-sql"
              isActive={activeTab === "sql"}
              onClick={() => setActiveTab("sql")}
            />
            <TabButton
              label="Log"
              icon="octicon:log-16"
              isActive={activeTab === "log"}
              onClick={() => setActiveTab("log")}
            />
            <TabButton
              label="Preview"
              icon="lucide:view"
              isActive={activeTab === "preview"}
              onClick={() => setActiveTab("preview")}
            />
            <TabButton
              label="Insert"
              icon="dashicons:insert"
              isActive={activeTab === "insert"}
              onClick={() => setActiveTab("insert")}
            />
          </div>
        </div>
        <div className="flex h-full w-full flex-col overflow-hidden rounded rounded-tr-none border">
          {tableData && tableData.columns && tableSpecs ? (
            <div className="h-full w-full">
              <div
                key={activeTable}
                ref={insertTabRef}
                className={cn(
                  "h-full w-full overflow-auto",
                  activeTab !== "insert" && "hidden"
                )}
              >
                <InsertTab
                  tableData={tableData}
                  tableSpecs={tableSpecs}
                  setTableSpecs={(spec) => setTableSpecs(spec)}
                />
              </div>
              <div
                ref={previewTabRef}
                className={cn(
                  activeTab !== "preview" && "hidden",
                  "h-full w-full overflow-auto"
                )}
              >
                <RenderPreview
                  tablePacket={tablePacket}
                  onRefresh={handleVerifyTableSpec}
                  noOfRows={tableSpecs?.noOfEntries}
                  pendingWrites={pendingWrites}
                  setPendingWrites={setPendingWrites}
                  setNoOfRows={(rows) =>
                    setTableSpecs((prev) => {
                      if (!prev) return prev
                      return {
                        ...prev,
                        noOfEntries: rows,
                      }
                    })
                  }
                />
              </div>
              <div
                ref={logTabRef}
                className={cn(
                  "relative flex h-full w-full flex-col",
                  activeTab !== "log" && "hidden"
                )}
              >
                <RenderLogs activeTab={activeTab} />
              </div>
              <div
                className={cn(
                  "relative flex h-full w-full flex-col",
                  activeTab !== "sql" && "hidden"
                )}
              >
                <SqlInsertionTab onSuccess={fetchActiveTableData} />
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon
                icon={`meteocons:${timeOfDay}-fill`}
                className="margin-auto h-16 w-16"
              />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function TabButton({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string
  icon: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        "w-32 cursor-pointer rounded rounded-b-none px-4 py-2 text-center",
        isActive ? "border border-b-0 bg-muted" : "opacity-50"
      )}
      onClick={onClick}
    >
      <div className="inline-flex items-center">
        <Icon icon={icon} className="h-4 w-4" />
        <p className="ml-2">{label}</p>
      </div>
    </div>
  )
}

function HandleTransaction({
  pendingWrites,
  setPendingWrites,
}: {
  pendingWrites: number
  setPendingWrites: (count: number) => void
}) {
  useEffect(() => {
    console.log("writes:", pendingWrites)
  }, [pendingWrites])

  function handleCommit() {
    invokeDbCommit()
      .then(() => {
        toast({
          title: "Commit Successful",
          description: "Your changes have been committed to the database.",
          variant: "success",
        })
        setPendingWrites(0)
      })
      .catch((error) => {
        console.error("Commit failed:", error)
        toast({
          title: "Commit Failed",
          description: "There was an error committing your changes.",
          variant: "destructive",
        })
      })
  }

  function handleRollback() {
    invokeDbRollback()
      .then(() => {
        toast({
          title: "Rollback Successful",
          description: "Your changes have been rolled back.",
          variant: "success",
        })
        setPendingWrites(0)
      })
      .catch((error) => {
        console.error("Rollback failed:", error)
        toast({
          title: "Rollback Failed",
          description: "There was an error rolling back your changes.",
          variant: "destructive",
        })
      })
  }

  return (
    <div className="flex gap-2">
      {pendingWrites > 0 && (
        <div className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-muted-foreground">
          <Icon icon="jam:alert" className="h-4 w-4 text-yellow-500" />
          <p>{pendingWrites} Pending Writes</p>
        </div>
      )}
      <button
        className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onClick={handleCommit}
      >
        <Icon icon="ion:git-commit-sharp" className="h-4 w-4 text-violet-500" />
        <span>Commit</span>
      </button>

      <button
        className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onClick={handleRollback}
      >
        <Icon
          icon="solar:rewind-back-bold-duotone"
          className="h-4 w-4 text-amber-500"
        />
        <span>Rollback</span>
      </button>
    </div>
  )
}
