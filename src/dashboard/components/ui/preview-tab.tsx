import { table } from "console"
import { useEffect, useState } from "react"
import {
  invokeExportSqlPacket,
  invokeGetGenPacket,
  invokeInsertSqlPacket,
} from "@/api/fill"
import { Icon } from "@iconify/react"
import { save } from "@tauri-apps/plugin-dialog"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { TablePacket } from "@/components/types"

interface RenderPreviewProps {
  tablePacket: TablePacket | null
  setTablePacket: (packet: TablePacket) => void
  onRefresh: () => void
  onInserted: () => void
  setPendingWrites: (n: number) => void
  noOfRows: number | null
  setNoOfRows: (rows: number) => void
}

export default function RenderPreview({
  tablePacket,
  setTablePacket,
  onRefresh,
  onInserted,
  noOfRows,
  setPendingWrites,
  setNoOfRows,
}: RenderPreviewProps) {
  const [dice, setDice] = useState<number>(1)
  const [errorCols, setErrorCols] = useState<Record<string, string>>({})
  const [warnCols, setWarningCols] = useState<Record<string, string>>({})
  const [showCheck, setShowCheck] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [page, setPage] = useState<number>(0)

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

  useEffect(() => {
    // console.log("Got packet:", tablePacket)
    if (tablePacket) {
      const errCol: Record<string, string> = {}
      const warnCol: Record<string, string> = {}
      setPage(tablePacket.page || 0)

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
  }, [tablePacket])

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
        setLoading(true)
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
      } finally {
        setLoading(false)
      }
    }
  }

  async function getNewPacket(page: number, packetId: string) {
    if (!tablePacket) return
    setLoading(true)
    try {
      let value = Number(page)
      if (value < 0) {
        value = 0
      } else if (value >= (tablePacket?.totalPages || 1)) {
        value = (tablePacket?.totalPages || 1) - 1
      }
      const newPacket = await invokeGetGenPacket(packetId, value)
      console.log("New packet page:", newPacket.page)
      setPage(newPacket.page || 0)
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

  async function doRefresh() {
    setLoading(true)
    try {
      await onRefresh()
    } catch (error) {
      console.error("Error refreshing:", error)
    } finally {
      setLoading(false)
    }
  }

  function shuffleDice() {
    const MaxRolls = 5
    let rollCount = 0
    const intervalID = setInterval(() => {
      let val = Math.floor(Math.random() * 6) + 1
      setDice(val)
      rollCount++
      if (rollCount >= MaxRolls) {
        clearInterval(intervalID)
      }
    }, 500)
  }

  return (
    <div className={cn("flex h-full flex-col", loading && "cursor-wait")}>
      {!tablePacket || loading ? (
        <div className="bg-current-foreground flex h-full flex-col items-center justify-center rounded-md bg-gradient-to-br text-gray-800">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" />
          <p className="text-base font-medium tracking-wide text-foreground">
            Generating preview...
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Hang tight. This may take a few seconds.
          </p>
        </div>
      ) : (
        <Table className="flex-shrink-0">
          <TableHeader>
            <TableRow>
              {tablePacket &&
                tablePacket.columns.map((column) => (
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
          </TableHeader>
          <TableBody>
            {tablePacket &&
              (() => {
                const columns = tablePacket.columns ?? []
                const entries = tablePacket.entries ?? []
                const rowCount = entries.length ?? 0
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
      )}

      <div className="sticky bottom-0 mt-auto flex items-center justify-center bg-muted p-2">
        <div>
          <button
            className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              shuffleDice()
              doRefresh()
            }}
          >
            {Array.from({ length: 7 }).map((_, i) => (
              <Icon
                key={i}
                icon={`bxs:dice-${i}`}
                className={cn(
                  "h-4 w-4 text-violet-500",
                  dice === i ? "animate-spin" : "hidden"
                )}
              />
            ))}
            <span>Refresh</span>
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
              value={noOfRows ?? 1}
              onChange={(e) => setNoOfRows(Number(e.target.value || NaN))}
              onBlur={(e) => {
                const value = Number(e.target.value)
                if (value === 0) {
                  setNoOfRows(1)
                } else if (value >= 99_999) {
                  setNoOfRows(99_999)
                }
                doRefresh()
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
                setPage(e.target.value ? Number(e.target.value) : Number(NaN))
              }
              onBlur={(e) => {
                let value = Number(e.target.value)
                getNewPacket(value, tablePacket?.id || "")
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
                  (!tablePacket || loading) && "cursor-wait opacity-50"
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
