import { useEffect, useState } from "react"
import { invokeInsertPacket } from "@/api/fill"
import { Icon } from "@iconify/react"
import { invoke } from "@tauri-apps/api/core"

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
import { ErrorPacketMap, TableMetadata, TablePacket } from "@/components/types"

interface RenderPreviewProps {
  tablePacket: TablePacket | null
  onRefresh: () => void
  pendingWrites: number
  setPendingWrites: (n: number) => void
  noOfRows: number
  setNoOfRows: (rows: number) => void
}

export default function RenderPreview({
  tablePacket,
  onRefresh,
  noOfRows,
  pendingWrites,
  setPendingWrites,
  setNoOfRows,
}: RenderPreviewProps) {
  const [dice, setDice] = useState<number>(1)
  const [errorCols, setErrorCols] = useState<Record<string, string>>({})
  const [warnCols, setWarningCols] = useState<Record<string, string>>({})

  function handleInsertPacket() {
    if (!tablePacket) return
    invokeInsertPacket(tablePacket)
      .then((res) => {
        toast({
          variant: "success",
          title: "Data inserted successfully!",
          description: `Inserted ${tablePacket.entries.length} rows into ${tablePacket.name}`,
        })
        setPendingWrites(res.pendingWrites)
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Error inserting data",
          description: err.message || "Unknown error occurred",
        })
      })
  }

  useEffect(() => {
    onRefresh()
  }, [pendingWrites])

  useEffect(() => {
    if (tablePacket) {
      const errCol: Record<string, string> = {}
      const warnCol: Record<string, string> = {}

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
    <div className="flex min-h-full flex-col">
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
                            : "[skip]"}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            })()}
        </TableBody>
      </Table>

      <div className="sticky bottom-0 mt-auto flex items-center justify-center bg-muted p-2">
        <button
          className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          onClick={() => {
            shuffleDice()
            onRefresh()
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
        <div>
          <Popover onOpenChange={(open) => !open && onRefresh()}>
            <PopoverTrigger asChild>
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
                <span>{noOfRows} Rows</span>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-44 bg-popover text-sm font-semibold">
              <label className="mb-2 block text-center">Rows: {noOfRows}</label>
              <input
                type="range"
                min={1}
                max={1000}
                value={noOfRows}
                onChange={(e) => setNoOfRows(Number(e.target.value))}
                className="w-full"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border bg-green-500 text-white">
          <button
            onClick={handleInsertPacket}
            className={cn(
              "flex w-[145px] items-center px-3 py-2 text-sm font-medium hover:bg-green-600"
            )}
          >
            <Icon icon="proicons:database-add" className="mr-2 h-4 w-4" />
            Insert into DB
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center border-l px-2 py-2 hover:bg-green-600"
                onClick={(e) => e.preventDefault()} // optional, avoids double triggers
              >
                <Icon icon="mdi:chevron-down" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              style={{ marginLeft: "-146px", width: "180px" }}
            >
              <DropdownMenuItem onSelect={() => console.log("Export SQL")}>
                <Icon icon="mdi:file-export" className="mr-4 h-4 w-4" />
                Export SQL
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
