import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"

import { cn } from "@/lib/utils"
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
  tableMetadata: TableMetadata
  tablePackets: TablePacket | null
  doRefresh: () => void
  noOfRows: number
  setNoOfRows: (rows: number) => void
}

export default function RenderPreview({
  tableMetadata,
  tablePackets,
  doRefresh,
  noOfRows,
  setNoOfRows,
}: RenderPreviewProps) {
  const [dice, setDice] = useState<number>(1)
  const [errorCols, setErrorCols] = useState<Record<string, string>>({})
  const [warnCols, setWarningCols] = useState<Record<string, string>>({})

  useEffect(() => {
    if (tablePackets) {
      const errCol: Record<string, string> = {}
      const warnCol: Record<string, string> = {}

      tablePackets.errors.forEach((error) => {
        if (error.column) {
          if (error.type == "error") {
            errCol[error.column] = error.msg ?? "Unknown"
          } else if (error.type == "warning") {
            warnCol[error.column] = error.msg ?? "Unknown"
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
  }, [tablePackets])

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
            {tablePackets &&
              tablePackets.columns.map((column) => (
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
          {tablePackets &&
            (() => {
              const columns = tablePackets.columns ?? []
              const entries = tablePackets.entries ?? []
              const rowCount = entries.length ?? 0
              const colCount = entries[0]?.length || 0
              const name = tablePackets.name

              return Array.from({ length: rowCount }).map((_, rowIndex) => (
                <TableRow key={`${name}.${rowIndex}`}>
                  {Array.from({ length: colCount }).map((_, colIndex) => {
                    const columnName = columns[colIndex]

                    return (
                      <TableCell
                        key={`${name}.${colIndex}.${rowIndex}`}
                        className={cn(
                          "w-[50px] whitespace-nowrap text-center",
                          warnCols[columnName] && "border-x-2 border-yellow-600",
                          errorCols[columnName] && "border-x-2 border-red-600"
                        )}
                      >
                        <div className="max-w-full">
                          {entries[rowIndex][colIndex]}
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
        <div>
          <Popover onOpenChange={(open) => !open && doRefresh()}>
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
                  className={cn("h-4 w-4 text-white")}
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
      </div>
    </div>
  )
}
