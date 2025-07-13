import { log } from "console"
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react"
import { invokeTableData } from "@/api/db"
import { invokeGetFakerMethods, invokeVerifySpec } from "@/api/fill"
import { python } from "@codemirror/lang-python"
import { sql } from "@codemirror/lang-sql"
import { Icon } from "@iconify/react"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { set } from "date-fns"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BaseSelectType,
  ColumnData,
  ColumnSpec,
  ColumnSpecMap,
  DataPackage,
  DbData,
  TableData,
  TablePacket,
  TableSpec,
  TableSpecMap,
} from "@/components/types"

interface ListTablesProps {
  dbData: DbData | null
  activeTable: string | null
  setActiveTable: (activeTable: string | null) => void
}

export default function InsertionPanel({
  dbData,
  activeTable,
  setActiveTable,
}: ListTablesProps) {
  const ref = useRef<HTMLDivElement>(null)
  const insertTabRef = useRef<HTMLDivElement>(null)
  const previewTabRef = useRef<HTMLDivElement>(null)
  const logTabRef = useRef<HTMLDivElement>(null)

  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [fakerMethods, setFakerMethods] = useState<string[]>([])
  const [hoveredGroup, setHoveredGroup] = useState<string[] | null>(null)
  const [activeTab, setActiveTab] = useState<string>("insert")
  const [globalSpecs, setGlobalSpecs] = useState<TableSpecMap>({})
  const [tablePackets, setTablePackets] = useState<TablePacket | null>(null)
  const [pendingRefresh, setPendingRefresh] = useState(false)
  const [logs, setLogs] = useState<string[]>([
    "[INFO  sqlalchemy.engine.Engine] SHOW VARIABLES LIKE 'sql_mode'",
    "[INFO  sqlalchemy.engine.Engine] {'param_1': 'sql_mode'}",
    "[INFO  sqlalchemy.engine.Engine] Collected server setting: STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION",
    "[INFO  sqlalchemy.engine.Engine] SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=%s",
    "[INFO  sqlalchemy.engine.Engine] {'TABLE_SCHEMA': 'test_db'}",
    "[INFO  sqlalchemy.engine.Engine] Retrieved 42 table(s) from schema `test_db`",
    "[INFO  sqlalchemy.engine.Engine] DESCRIBE `user_activity`",
    "[INFO  sqlalchemy.engine.Engine] {}",
    "[INFO  sqlalchemy.engine.Engine] Columns: [id, user_id, activity_type, metadata, created_at, updated_at]",
    "[DEBUG sqlalchemy.pool.impl.QueuePool] Connection <mysql.connector.connection.MySQLConnection object at 0x102fe8120> checked out from pool",
    "[INFO  sqlalchemy.engine.Engine] INSERT INTO `order_logs` (`order_id`, `status`, `payload`, `created_at`) VALUES (%s, %s, %s, %s)",
    "[INFO  sqlalchemy.engine.Engine] (88273, 'FAILED', '{'error':'timeout','retry':false}', '2025-07-11 13:28:45')",
    "[INFO  sqlalchemy.engine.Engine] SELECT `user_id`, COUNT(*) AS `login_count` FROM `logins` WHERE `created_at` >= %s GROUP BY `user_id` HAVING `login_count` > %s ORDER BY `login_count` DESC",
    "[INFO  sqlalchemy.engine.Engine] ('2025-01-01 00:00:00', 100)",
    "[WARNING sqlalchemy.dialects.mysql.base] Column 'session_data' has a JSON type but is mapped as a TEXT. Consider using the JSON type for better integration.",
    "[INFO  sqlalchemy.engine.Engine] SHOW CREATE TABLE `audit_events`",
    "[INFO  sqlalchemy.engine.Engine] {}",
    "[INFO  sqlalchemy.engine.Engine] ",
    "CREATE TABLE `audit_events` (",
    "  `id` int NOT NULL AUTO_INCREMENT,",
    "  `event_type` varchar(50) DEFAULT NULL,",
    "  `data` json DEFAULT NULL,",
    "  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,",
    "  PRIMARY KEY (`id`)",
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    "[INFO  sqlalchemy.engine.Engine] COMMIT",
    "[DEBUG sqlalchemy.pool.impl.QueuePool] Connection <mysql.connector.connection.MySQLConnection object at 0x103d9a2b0> returned to pool",
  ])

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

    invokeGetFakerMethods()
      .then((methods) => {
        setFakerMethods(methods)
      })
      .catch((error) => {
        console.error("Error fetching faker methods:", error)
      })

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  useEffect(() => {
    setActiveTab("insert")

    async function fetchAndInit() {
      const table = await getTableData()
      if (!table) return

      setTableData(table)

      setGlobalSpecs((prev) => {
        if (prev[table.name]) return prev

        const columnSpecMap = table.columns.reduce((acc, col) => {
          acc[col.name] = {
            name: col.name,
            nullChance: 0,
            method: null,
            type: "faker",
          }
          return acc
        }, {} as ColumnSpecMap)

        return {
          ...prev,
          [table.name]: {
            name: table.name,
            noOfEntries: 50,
            columns: columnSpecMap,
          },
        }
      })
    }

    fetchAndInit()
  }, [activeTable])

  useEffect(() => {
    insertTabRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    })
    previewTabRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth",
    })
    logTabRef.current?.scrollTo({
      top: logTabRef.current.scrollHeight,
      left: 0,
      behavior: "smooth",
    })
  }, [activeTable])

  useEffect(() => {
    if (activeTab === "preview" && (!tablePackets || pendingRefresh)) {
      verifyTableSpec()
    }
  }, [activeTab])

  function verifyTableSpec() {
    if (!activeTable) return

    const tableSpec: TableSpec = {
      name: activeTable,
      noOfEntries: globalSpecs[activeTable]?.noOfEntries,
      columns: Object.values(globalSpecs[activeTable]?.columns) as ColumnSpec[],
    }
    invokeVerifySpec(tableSpec)
      .then((res) => {
        setTablePackets(res)
        console.log("Spec verified:", res)
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

  async function getTableData(): Promise<TableData | null> {
    if (!dbData || !dbData.connected || !activeTable) return null
    try {
      const res = await invokeTableData(activeTable)
      setTableData(res)
      return res
    } catch (err) {
      console.error("Error fetching table data:", err)
      setTableData(null)
      return null
    }
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
              <HandleTransaction />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-end">
        <div className="ml-auto flex items-center rounded text-sm font-medium">
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
        {tableData && tableData.columns && globalSpecs[tableData.name] ? (
          <div className="h-full w-full">
            <div
              ref={insertTabRef}
              className={cn(
                "h-full w-full overflow-auto",
                activeTab !== "insert" && "hidden"
              )}
            >
              <Table>
                <TableBody>
                  {tableData.columns.map((column) => (
                    <DBColumn
                      key={`${tableData.name}-${column.name}`}
                      column={column}
                      columnSpec={
                        (globalSpecs[tableData.name]?.columns[
                          column.name
                        ] as ColumnSpec) ?? {}
                      }
                      setColumnSpec={(newSpec) =>
                        setGlobalSpecs((prev) => {
                          const table = tableData.name
                          return {
                            ...prev,
                            [table]: {
                              ...prev?.[table],
                              columns: {
                                ...prev?.[table]?.columns,
                                [column.name]: newSpec,
                              },
                            },
                          }
                        })
                      }
                      fakerMethods={fakerMethods}
                      uniques={tableData.uniques}
                      hoveredGroup={hoveredGroup}
                      setHoveredGroup={setHoveredGroup}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <div
              ref={previewTabRef}
              className={cn(
                activeTab !== "preview" && "hidden",
                "h-full w-full overflow-auto"
              )}
            >
              <RenderPreview
                tableData={tableData}
                tablePackets={tablePackets}
                doRefresh={verifyTableSpec}
                noOfRows={globalSpecs[tableData.name]?.noOfEntries}
                setNoOfRows={(rows) =>
                  setGlobalSpecs((prev) => {
                    return {
                      ...prev,
                      [tableData.name]: {
                        ...prev?.[tableData.name],
                        noOfEntries: rows,
                      },
                    }
                  })
                }
              />
            </div>
            <div
              ref={logTabRef}
              className={cn(
                "h-full w-full overflow-auto",
                activeTab !== "log" && "hidden"
              )}
            >
              <RenderLogs logs={logs} />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              icon={`meteocons:${timeOfDay}`}
              className="margin-auto h-16 w-16"
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface RenderLogsProps {
  logs: string[]
}

function RenderLogs({ logs }: RenderLogsProps) {
  return (
    <div className="m-4 mt-auto">
      {logs
        .slice()
        .reverse()
        .map((log, index) => (
          <p
            key={index}
            className={cn(
              "text-sm text-muted-foreground",
              index === logs.length - 1 && "font-medium text-slate-400"
            )}
          >
            {log}
          </p>
        ))}
      {Array.from({ length: 4 }).map((_, index) => (
        <br key={index} />
      ))}
    </div>
  )
}

interface RenderPreviewProps {
  tableData: TableData
  tablePackets: TablePacket | null
  doRefresh: () => void
  noOfRows: number
  setNoOfRows: (rows: number) => void
}

function RenderPreview({
  tableData,
  tablePackets,
  doRefresh,
  noOfRows,
  setNoOfRows,
}: RenderPreviewProps) {
  const [dice, setDice] = useState<number>(1)

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
                <TableHead key={column}>{column}</TableHead>
              ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tablePackets &&
            Array.from({ length: tablePackets.entries?.[0].length }).map(
              (_, colIndex) => (
                <TableRow key={`${tablePackets.name}.${colIndex}`}>
                  {Array.from({ length: tablePackets.entries.length }).map(
                    (_, rowIndex) => (
                      <TableCell
                        key={`${tablePackets.name}.${colIndex}.${rowIndex}`}
                        className="w-[50px] overflow-x-auto whitespace-nowrap"
                      >
                        <div className="max-w-full overflow-x-auto">
                          {tablePackets.entries[rowIndex][colIndex]}
                        </div>
                      </TableCell>
                    )
                  )}
                </TableRow>
              )
            )}
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

interface DBColumnProps {
  column: ColumnData
  columnSpec: ColumnSpec
  setColumnSpec: (newSpec: ColumnSpec) => void
  hoveredGroup: string[] | null
  setHoveredGroup: (group: string[] | null) => void
  uniques: string[][]
  fakerMethods: string[]
}

function DBColumn({
  column,
  columnSpec,
  setColumnSpec,
  uniques,
  fakerMethods,
  hoveredGroup,
  setHoveredGroup,
}: DBColumnProps) {
  const [baseSelect, setBaseSelect] = useState<BaseSelectType>("faker")
  const [advancedSelect, setAdvanceSelect] = useState<string | null>(null)
  const [nullProbability, setNullProbability] = useState(0)

  const thisGroups = uniques.filter((g) => g.includes(column.name))
  const inHovered = hoveredGroup?.includes(column.name)

  const nullReason = column.primaryKey
    ? "is primary key"
    : column.autoincrement
      ? "auto-increments"
      : !!column.default
        ? "has default value"
        : !column.nullable
          ? "is not nullable"
          : column.computed
            ? "is computed"
            : thisGroups.length > 0
              ? "is unique"
              : ""

  useEffect(() => {
    setColumnSpec({
      name: column.name,
      nullChance: nullProbability / 10,
      method: advancedSelect,
      type: baseSelect,
    })
  }, [baseSelect, advancedSelect, nullProbability])

  useEffect(() => {
    if (columnSpec) {
      setBaseSelect(columnSpec.type)
      setAdvanceSelect(columnSpec.method)
      setNullProbability(columnSpec.nullChance / 10)
    }
  }, [])

  return (
    <TableRow
      key={column.name}
      onMouseEnter={() => setHoveredGroup(thisGroups[0] ?? null)}
      onMouseLeave={() => setHoveredGroup(null)}
    >
      <TableCell
        title={
          column.primaryKey
            ? "Primary Key"
            : thisGroups.length > 0
              ? `UNIQUE(${thisGroups})`
              : "Not Unique"
        }
        className={cn(
          inHovered && "font-medium text-blue-400",
          column.primaryKey && "text-purple-500"
        )}
      >
        {column.name}
      </TableCell>

      <TableCell>{column.type}</TableCell>

      <TableCell>
        <RenderNullChanceControl
          nullReason={nullReason}
          nullProbability={nullProbability}
          setNullProbability={setNullProbability}
        />
      </TableCell>

      <TableCell>
        <BaseFillSelect
          selected={baseSelect}
          setSelected={setBaseSelect}
          column={column}
        />
      </TableCell>

      <TableCell>
        <AdvancedFillSelect
          column={column}
          baseSelect={baseSelect}
          selected={advancedSelect}
          setSelected={setAdvanceSelect}
          fakerMethods={fakerMethods}
        />
      </TableCell>
      <TableCell></TableCell>
    </TableRow>
  )
}

interface RenderNullChanceControlProps {
  nullReason: string
  nullProbability: number
  setNullProbability: Dispatch<SetStateAction<number>>
}

function RenderNullChanceControl({
  nullReason,
  nullProbability,
  setNullProbability,
}: RenderNullChanceControlProps) {
  return (
    <div
      className="w-[100px]"
      title={nullReason || `${nullProbability}% inserted values will be null`}
    >
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center">
            <Icon
              icon="tabler:salt"
              className={cn(
                "mr-2 h-4 w-4",
                nullReason
                  ? "cursor-not-allowed text-stone-500"
                  : "cursor-pointer"
              )}
            />
            <Badge
              variant={nullProbability > 0 ? "outline" : "secondary"}
              className={cn(
                nullReason
                  ? "cursor-not-allowed text-muted-foreground"
                  : "cursor-pointer"
              )}
              onClick={(e) => {
                if (nullReason) return
                e.stopPropagation()
                e.preventDefault()
                setNullProbability((prev) =>
                  prev === 0 ? 1 : prev === 1 ? 5 : prev == 5 ? 10 : 0
                )
              }}
            >
              {nullProbability}%
            </Badge>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-44 bg-popover text-sm font-semibold">
          <label className="mb-2 block">
            Chance of null: {nullProbability}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={nullProbability}
            onChange={(e) => setNullProbability(Number(e.target.value))}
            className="w-full"
            disabled={Boolean(nullReason)}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface BaseFillSelectProps {
  selected: BaseSelectType
  setSelected: (view: BaseSelectType) => void
  column: ColumnData
}

function BaseFillSelect({ setSelected, column }: BaseFillSelectProps) {
  type view =
    | "faker"
    | "regex"
    | "foreign"
    | "autoincrement"
    | "computed"
    | "python"

  const [selectDisabled, setSelectDisabled] = useState(false)
  const [baseView, setBaseView] = useState<view>("faker")

  useEffect(() => {
    if (column?.foreignKeys?.table) {
      setBaseView("foreign")
      setSelectDisabled(true)
    } else if (column.autoincrement) {
      setBaseView("autoincrement")
      setSelectDisabled(true)
    } else if (column.computed) {
      setBaseView("computed")
      setSelectDisabled(true)
    } else if (column.type.includes("VARCHAR")) {
      setBaseView("faker")
    } else {
      setBaseView("faker")
    }
  }, [])

  useEffect(() => {
    if (baseView === "autoincrement" || baseView === "computed") {
      setSelected("auto")
    } else {
      setSelected(baseView as BaseSelectType)
    }
  }, [baseView])

  return (
    <Select value={baseView} onValueChange={(val) => setBaseView(val as view)}>
      <SelectTrigger className="w-[180px]" disabled={selectDisabled}>
        <SelectValue placeholder="Choose view" />
      </SelectTrigger>

      <SelectContent>
        {column.foreignKeys?.table ? (
          <SelectItem value="foreign">
            <div className="flex items-center">
              <Icon
                icon="tabler:package-import"
                className="mr-2 h-4 w-4 text-yellow-400"
              />
              Foreign Key
            </div>
          </SelectItem>
        ) : column.autoincrement ? (
          <SelectItem value="autoincrement">
            <div className="flex items-center">
              <Icon
                icon="mdi:increment"
                className="mr-2 h-4 w-4 text-amber-400"
              />
              Auto Increment
            </div>
          </SelectItem>
        ) : column.computed ? (
          <SelectItem value="computed">
            <div className="flex items-center">
              <Icon
                icon="fa-solid:code"
                className="mr-2 h-4 w-4 text-blue-600"
              />
              Computed
            </div>
          </SelectItem>
        ) : (
          <>
            <SelectItem value="faker">
              <div className="flex items-center">
                <Icon
                  icon="ep:collection"
                  className="mr-2 h-4 w-4 text-purple-400"
                />
                Faker
              </div>
            </SelectItem>
            <SelectItem value="regex">
              <div className="flex items-center">
                <Icon
                  icon="mdi:regex"
                  className="mr-2 h-4 w-4 text-green-500"
                />
                Regex
              </div>
            </SelectItem>
            <SelectItem value="python">
              <div className="flex items-center">
                <Icon
                  icon="material-icon-theme:python"
                  className="mr-2 h-4 w-4"
                />
                Py Script
              </div>
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  )
}

interface AdvancedFillSelectProps {
  column: ColumnData
  baseSelect: string
  selected: string | null
  setSelected: (value: string | null) => void
  fakerMethods: string[]
}

function AdvancedFillSelect({
  column,
  baseSelect,
  selected,
  setSelected,
  fakerMethods,
}: AdvancedFillSelectProps) {
  const [open, setOpen] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    if (!selected) {
      if (baseSelect === "faker") {
        setSelected(fakerMethods?.[0] || null)
      } else {
        setSelected(null)
      }
    }
  }, [baseSelect])

  return baseSelect === "faker" ? (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[200px] justify-between")}
        >
          {selected ?? "Select item"}
          <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>No item found.</CommandEmpty>
          <CommandList>
            {fakerMethods.map((item) => (
              <CommandItem
                key={item}
                value={item}
                onSelect={(val) => {
                  setSelected(val)
                  setOpen(false)
                }}
              >
                {item}
                <CheckIcon
                  className={cn(
                    "ml-auto h-4 w-4",
                    selected === item ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  ) : baseSelect === "foreign" ? (
    <Popover open={false}>
      <PopoverTrigger asChild>
        <span
          title={`Table: ${column.foreignKeys.table} Column: ${column.foreignKeys.column}`}
        >
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={false}
            className="w-[200px] justify-between"
            disabled
          >
            {column.foreignKeys.table}.{column.foreignKeys.column}
            <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </span>
      </PopoverTrigger>
    </Popover>
  ) : baseSelect === "regex" ? (
    <div className="overflow-auto rounded border">
      <CodeMirror
        placeholder={"Regex (Python engine)"}
        value={selected ?? ""}
        extensions={[EditorView.lineWrapping]}
        theme={theme === "light" ? githubLight : githubDark}
        height="auto"
        minHeight="35px"
        maxHeight="200px"
        className="w-150 cm-content"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
      />
    </div>
  ) : baseSelect === "python" ? (
    <div className="overflow-auto rounded border">
      <CodeMirror
        placeholder={"# Python Function"}
        value={selected ?? ""}
        extensions={[python(), EditorView.lineWrapping]}
        theme={theme === "light" ? githubLight : githubDark}
        height="auto"
        minHeight="35px"
        maxHeight="200px"
        className="w-150"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
      />
    </div>
  ) : baseSelect === "sql" ? (
    <div className="overflow-auto rounded border">
      <CodeMirror
        value={selected ?? ""}
        placeholder={"-- SQL expression"}
        extensions={[sql(), EditorView.lineWrapping]}
        theme={theme === "light" ? githubLight : githubDark}
        height="auto"
        minHeight="35px"
        maxHeight="200px"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
        style={{ whiteSpace: "pre" }}
      />
    </div>
  ) : null
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

function HandleTransaction() {
  const [dataPackage, setDataPackage] = useState<DataPackage | null>(null)
  const [openDropdown, setOpenDropdown] = useState(false)

  useEffect(() => {
    setDataPackage(() => {
      return {
        verified: true,
        table: "user",
        entries: [],
        inserted: false,
      }
    })
  }, [])

  return (
    <div className="flex gap-2">
      <button
        className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          console.log("Commit triggered")
        }}
      >
        <Icon icon="ion:git-commit-sharp" className="h-4 w-4 text-violet-500" />
        <span>Commit</span>
      </button>

      <button
        className="inline-flex items-center space-x-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          console.log("Rollback triggered")
        }}
      >
        <Icon
          icon="solar:rewind-back-bold-duotone"
          className="h-4 w-4 text-amber-500"
        />
        <span>Rollback</span>
      </button>
      <div>
        <div className="inline-flex overflow-hidden rounded-md border bg-green-500 text-white">
          {/* Primary Save button */}
          <button
            onClick={() => {
              console.log("Primary Save action - Insert to DB")
            }}
            className={cn(
              "flex w-[145px] items-center px-3 py-2 text-sm font-medium hover:bg-green-600"
            )}
          >
            <Icon icon="proicons:database-add" className="mr-2 h-4 w-4" />
            Insert into DB
          </button>

          {/* Dropdown trigger */}
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
