import { useEffect, useState } from "react"
import {
  invokeExportSqlPacket,
  invokeGenPackets,
  invokeGetGenPacket,
  invokeGetGenResult,
  invokeInsertSqlPacket,
  invokeKillGenPackets,
} from "@/api/fill"
import { Icon } from "@iconify/react"
import { save } from "@tauri-apps/plugin-dialog"
import { set } from "date-fns"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import {
  ColumnSpec,
  PacketProgress,
  TablePacket,
  TableSpec,
  TableSpecEntry,
} from "@/components/types"

interface RenderPreviewProps {
  tableSpec: TableSpecEntry | null
  onInserted: () => void
  setPendingWrites: (n: number) => void
  noOfRows: number | null
}

export default function RenderPreview({
  tableSpec,
  onInserted,
  noOfRows,
  setPendingWrites,
}: RenderPreviewProps) {
  const [errorCols, setErrorCols] = useState<Record<string, string>>({})
  const [warnCols, setWarningCols] = useState<Record<string, string>>({})
  const [showCheck, setShowCheck] = useState<boolean>(false)
  const [tablePacket, setTablePacket] = useState<TablePacket | null>(null)
  const [needsRefresh, setNeedsRefresh] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(false)
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [page, setPage] = useState<number>(0)
  const [progress, setProgress] = useState<PacketProgress | null>(null)
  const [noOfRowsInput, setNoOfRowsInput] = useState<number | null>(
    noOfRows || 1
  )

  useEffect(() => {
    setNeedsRefresh(true)
  }, [tableSpec])

  useEffect(() => {
    setTablePacket(null)
    handleKillGenPackets()
  }, [tableSpec?.name])

  useEffect(() => {
    if (tablePacket) {
      const errCol: Record<string, string> = {}
      const warnCol: Record<string, string> = {}
      setPage(tablePacket.page || 0)

      if (!tablePacket.errors) return

      tablePacket.errors.forEach((error) => {
        if (error.column) {
          const msg = `${error.column}: ${error.msg ?? "Unknown"}`
          if (error.type === "error") {
            errCol[error.column] = msg
          } else if (error.type === "warning") {
            warnCol[error.column] = msg
          }
        }
      })

      setErrorCols(errCol)
      setWarningCols(warnCol)

      if (Object.keys(warnCol).length > 0) {
        toast({
          variant: "warning",
          title: "Warnings found",
          description: (
            <pre className="whitespace-pre-wrap">
              {Object.values(warnCol).join("\n")}
            </pre>
          ),
        })
      }
      if (Object.keys(errCol).length > 0) {
        toast({
          variant: "destructive",
          title: "Errors found",
          description: (
            <pre className="whitespace-pre-wrap">
              {Object.values(errCol).join("\n")}
            </pre>
          ),
        })
      }
    }
  }, [tablePacket?.errors])

  useEffect(() => {
    if (!pendingJobId) return

    setLoading(true)
    const interval = setInterval(() => {
      invokeGetGenResult(pendingJobId)
        .then((result) => {
          if (result.status === "done" && result.data) {
            console.log("Received generation result:", result)
            setTablePacket(result.data)
            clearInterval(interval)
            setLoading(false)
            setPendingJobId(null)
            setProgress(null)
            return
          } else {
            console.log("Polling result:", result)
            setProgress(result.progress)
          }
        })
        .catch((error) => {
          console.error("Error fetching generation result:", error)
          setLoading(false)
          clearInterval(interval)
          setPendingJobId(null)
        })
    }, 1000)

    return () => clearInterval(interval)
  }, [pendingJobId])

  function handleInsertPacket() {
    if (!tablePacket) return
    setLoading(true)
    invokeInsertSqlPacket(tablePacket.id)
      .then((res) => {
        setShowCheck(true)
        onInserted()
        setPendingWrites(res.pendingWrites)
        setTimeout(() => {
          setShowCheck(false)
        }, 2000)
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Error inserting data",
          description: err.message || "Unknown error occurred",
        })
      })
      .finally(() => {
        setLoading(false)
      })
  }

  async function handleKillGenPackets() {
    try {
      invokeKillGenPackets()
    } catch (error) {
      console.log("Error", error)
    }
  }

  async function HandleGenerateTablePackets(
    tSpec: TableSpecEntry | null = null,
    rows: number | null = null
  ) {
    const specEntry = tSpec || tableSpec
    if (!specEntry) return

    const newTableSpec: TableSpec = {
      name: specEntry.name,
      noOfEntries: noOfRowsInput || rows || specEntry.noOfEntries || 25,
      pageSize: 250,
      columns: Object.values(specEntry?.columns ?? []) as ColumnSpec[],
    }
    try {
      const res = await invokeGenPackets(newTableSpec)
      setPendingJobId(res.jobId)
      setProgress(res)
      setNeedsRefresh(false)
      console.log("Generation started with job ID:", res.jobId)
    } catch (error) {
      console.error("Error verifying spec:", error)
    }
  }

  async function handleSaveToFile() {
    if (!tablePacket) return

    const fileName = `${
      tablePacket?.name || "unnamed_table"
    }_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`

    const filePath = await save({
      defaultPath: fileName,
      filters: [
        {
          name: "SQL File",
          extensions: ["sql"],
        },
      ],
    })
    if (filePath) {
      try {
        await invokeExportSqlPacket(tablePacket.id, filePath)
        setShowCheck(true)
        setTimeout(() => {
          setShowCheck(false)
        }, 2000)
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error exporting SQL",
          description: (error as Error).message || "Unknown error occurred",
        })
      }
    }
  }

  async function getNewPacket(page: number | string, packetId: string) {
    if (!tablePacket) return
    setLoading(true)
    try {
      let value = Number(page)
      if (value < 0) {
        value = 0
      } else if (value >= (tablePacket?.totalPages || 1)) {
        value = (tablePacket?.totalPages || 1) - 1
      }
      setPage(value)
      const newPacket = await invokeGetGenPacket(packetId, value)
      console.log("New packet page:", newPacket.page)
      setTablePacket(newPacket)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error fetching new packet",
        description: (error as Error).message || "Unknown error occurred",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("flex h-full flex-col", loading && "cursor-wait")}>
      <div
        className={cn(
          "bg-current-foreground flex h-full flex-col items-center justify-center rounded-md bg-gradient-to-br text-gray-800",
          !loading && "hidden"
        )}
      >
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
        <p className="text-base font-medium tracking-wide text-foreground">
          Generating preview...
        </p>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Hang tight. This may take a while.
        </p>
        <div className="w-full max-w-lg">
          <div className="mt-4 flex w-full justify-between space-x-2 text-foreground">
            <p>{progress?.status + "..."}</p>
            <p>{progress?.column}</p>
          </div>
          <div className="mt-4 w-full max-w-lg">
            <Progress
              value={((progress?.row ?? 0) / (progress?.total ?? 1)) * 100}
            />
          </div>
        </div>
        <div className="mt-5">
          <button
            onClick={handleKillGenPackets}
            className={cn(
              "flex items-center rounded px-6 py-2 text-muted-foreground",
              "bg-muted hover:bg-red-600 hover:text-white"
            )}
          >
            <Icon icon="la:skull-crossbones" className="mr-4 h-4 w-4" /> Stop
            Generation
          </button>
        </div>
      </div>
      <div className={cn("flex-1", loading && "hidden")}>
        <Table className="flex-shrink-0">
          <TableHeader>
            {tablePacket ? (
              <TableRow>
                {tablePacket.columns?.map((column) => (
                  <TableHead
                    title={
                      (errorCols && errorCols[column]) ||
                      (warnCols && warnCols[column])
                    }
                    key={column}
                    className={cn(
                      "bg-purple-400 text-center text-black",
                      warnCols[column] && "bg-yellow-400",
                      errorCols[column] && "bg-red-400"
                    )}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            ) : (
              tableSpec && (
                <TableRow>
                  {Object.keys(tableSpec.columns).map((colName) => (
                    <TableHead
                      key={colName}
                      className="bg-purple-400 text-center text-black"
                    >
                      {colName}
                    </TableHead>
                  ))}
                </TableRow>
              )
            )}
          </TableHeader>
          <TableBody>
            {tablePacket &&
              (() => {
                const columns = tablePacket.columns ?? []
                const entries = tablePacket.entries ?? []
                const rowCount = entries.length
                const colCount = entries[0]?.length || 0
                const name = tablePacket.name

                return Array.from({ length: rowCount }).map((_, rowIndex) => (
                  <TableRow key={`${name}.${rowIndex}`}>
                    {Array.from({ length: colCount }).map((_, colIndex) => {
                      const columnName = columns[colIndex]

                      return (
                        <TableCell
                          key={`${name}.${colIndex}.${rowIndex}`}
                          className={cn(
                            "w-[50px] whitespace-nowrap text-center",
                            warnCols[columnName] && "bg-yellow-100/25",
                            errorCols[columnName] && "bg-red-100/25"
                          )}
                        >
                          <div className="max-w-full">
                            {entries[rowIndex][colIndex] !== null
                              ? entries[rowIndex][colIndex]
                              : "NULL"}
                          </div>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              })()}
          </TableBody>
        </Table>
        {!tablePacket && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm font-medium">
              Preview your generated data here.
            </p>
          </div>
        )}
      </div>
      <div className="sticky bottom-0 mt-auto flex items-center justify-center bg-muted p-2">
        <div>
          <button
            className={cn(
              "inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm",
              "font-medium hover:bg-accent hover:text-accent-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
              needsRefresh && "bg-purple-500 text-white"
            )}
            disabled={loading}
            onClick={() => {
              HandleGenerateTablePackets()
            }}
          >
            <Icon
              icon="streamline-ultimate:factory-industrial-robot-arm-1-bold"
              className={cn("h-4 w-4", !needsRefresh && "text-purple-500")}
            />
            <span>Generate</span>
          </button>
        </div>
        <div>
          <div
            className={cn(
              "inline-flex items-center space-x-2 rounded-md border px-3 py-2",
              "text-sm font-medium hover:bg-accent hover:text-accent-foreground",
              "ml-4"
            )}
          >
            <Icon
              icon="material-symbols:add-row-below"
              className={cn("h-4 w-4 text-foreground")}
            />
            <input
              type="number"
              max={99_999}
              min={1}
              value={noOfRowsInput ?? noOfRows ?? 0}
              onChange={(e) =>
                setNoOfRowsInput(e.target.value ? Number(e.target.value) : NaN)
              }
              onBlur={(e) => {
                let value = Number(e.target.value)
                if (value === 0) {
                  value += 1
                } else if (value >= 99_999) {
                  value = 99_999
                }
                setNoOfRowsInput(value)
                setNeedsRefresh(true)
              }}
            />
            <span> Rows</span>
          </div>
        </div>
        <div className="ml-auto">
          <div className="flex flex-row items-center space-x-2">
            <button
              disabled={page <= 0}
              onClick={() => getNewPacket(page - 1, tablePacket?.id || "")}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                icon="streamline:move-left-solid"
                className="mr-1 h-5 w-5 text-purple-500"
              />
            </button>
            <span className="text-muted-foreground">
              {(tablePacket?.totalPages || 1) - 1} /
            </span>
            <input
              type="number"
              max={tablePacket?.totalPages || 99}
              min={0}
              value={page ?? 0}
              onChange={(e) =>
                setPage(e.target.value ? Number(e.target.value) : NaN)
              }
              onBlur={(e) => {
                getNewPacket(e.target.value, tablePacket?.id || "")
              }}
            />
            <button
              disabled={page >= (tablePacket?.totalPages || 1) - 1}
              onClick={() => getNewPacket(page + 1, tablePacket?.id || "")}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                icon="streamline:move-right-solid"
                className="ml-1 h-5 w-5 text-purple-500"
              />
            </button>
          </div>
        </div>
        <div className="ml-auto">
          <div className="flex items-center space-x-2">
            {showCheck && (
              <Icon
                icon="lets-icons:check-fill"
                className="mr-4 h-6 w-6 animate-fade-in-out-once text-green-500"
              />
            )}
            {errorCols && Object.keys(errorCols).length > 0 ? (
              <Icon icon="jam:alert" className="h-5 w-5 text-red-500" />
            ) : warnCols && Object.keys(warnCols).length > 0 ? (
              <Icon icon="jam:alert" className="h-5 w-5 text-yellow-500" />
            ) : null}
            <div className="inline-flex overflow-hidden rounded-md border bg-purple-500 text-white">
              <button
                onClick={handleInsertPacket}
                disabled={!tablePacket || loading}
                className={cn(
                  "flex w-[145px] items-center px-3 py-2",
                  "text-sm font-medium hover:bg-purple-600",
                  loading && "cursor-wait opacity-50",
                  !tablePacket && "cursor-not-allowed opacity-50"
                )}
              >
                <Icon icon="proicons:database-add" className="mr-2 h-4 w-4" />
                Insert into DB
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center border-l px-2 py-2 hover:bg-purple-600"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Icon icon="mdi:chevron-down" className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  style={{ marginLeft: "-146px", width: "180px" }}
                >
                  <DropdownMenuItem
                    onSelect={handleSaveToFile}
                    disabled={!tablePacket || loading}
                  >
                    <Icon icon="mdi:file-export" className="mr-4 h-4 w-4" />
                    Export SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
