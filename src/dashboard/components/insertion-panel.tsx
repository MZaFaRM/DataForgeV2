import { useEffect, useRef, useState } from "react"
import { invokeTableData } from "@/api/db"
import { invokeGetFakerMethods } from "@/api/fill"
import { python } from "@codemirror/lang-python"
import { sql } from "@codemirror/lang-sql"
import { Icon } from "@iconify/react"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
import { set } from "date-fns"
import { ta } from "date-fns/locale"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ColumnData, DataPackage, DbData, TableData } from "@/components/types"

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
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [fakerMethods, setFakerMethods] = useState<string[]>([])
  const [hoveredGroup, setHoveredGroup] = useState<string[] | null>(null)
  const [activeTab, setActiveTab] = useState<string>("insert")
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
        console.log("Available height:", spaceBelow - 40 + "px")

        const spaceRight = window.innerWidth - rect.left
        setAvailableWidth(spaceRight - 40 + "px")
      }
    }

    invokeGetFakerMethods()
      .then((methods) => {
        setFakerMethods(methods)
        console.log("Faker methods fetched:", methods)
      })
      .catch((error) => {
        console.error("Error fetching faker methods:", error)
      })

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  useEffect(() => {
    getTableData()
  }, [activeTable])

  useEffect(() => {
    if (!tableContainerRef.current) return
    if (activeTab === "insert" || activeTab === "preview") {
      console.log("Scrolling to top of preview")
      tableContainerRef.current.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      })
    } else if (activeTab === "log") {
      setTimeout(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTo({
            top: tableContainerRef.current.scrollHeight,
            left: 0,
            behavior: "smooth",
          })
        }
      })
    }
  }, [activeTab, activeTable])

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
      .then((res) => {
        setTableData(res)
        console.log("Table data fetched:", res)
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
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center space-x-2">
                <h2 className="text-2xl font-semibold tracking-wide">
                  {activeTable}
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
                        title="parent tables"
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
        {tableData && tableData.columns ? (
          activeTab === "insert" ? (
            <div
              className="h-full w-full overflow-auto"
              ref={tableContainerRef}
            >
              <Table>
                <TableBody>
                  {tableData.columns.map((column) => (
                    <DBColumn
                      key={column.name}
                      column={column}
                      fakerMethods={fakerMethods}
                      uniques={tableData.uniques}
                      hoveredGroup={hoveredGroup}
                      setHoveredGroup={setHoveredGroup}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : activeTab === "preview" ? (
            <div
              className="h-full w-full overflow-auto"
              ref={tableContainerRef}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableData.columns.map((column) => (
                      <TableHead key={column.name}>{column.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                {/* <TableBody> */}

                {/* </TableBody> */}
              </Table>
            </div>
          ) : (
            <div
              className="flex h-full w-full flex-col overflow-auto p-4"
              ref={tableContainerRef}
            >
              <div className="mt-auto">
                {logs
                  .slice()
                  .reverse()
                  .map((log, index) => (
                    <p
                      key={index}
                      className={cn(
                        "text-sm text-muted-foreground",
                        index === logs.length - 1 &&
                          "font-medium text-slate-400"
                      )}
                    >
                      {log}
                    </p>
                  ))}
                {Array.from({ length: 4 }).map((_, index) => (
                  <br key={index} />
                ))}
              </div>
            </div>
          )
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

interface DBColumnProps {
  column: ColumnData
  hoveredGroup: string[] | null
  setHoveredGroup: (group: string[] | null) => void
  uniques: string[][]
  fakerMethods: string[]
}

function DBColumn({
  column,
  uniques,
  fakerMethods,
  hoveredGroup,
  setHoveredGroup,
}: DBColumnProps) {
  const [baseSelect, setBaseSelect] = useState("faker")
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
        <div
          className="w-[100px]"
          title={
            nullReason || `${nullProbability}% inserted values will be null`
          }
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

interface BaseFillSelectProps {
  selected: string
  setSelected: (view: string) => void
  column: ColumnData
}

function BaseFillSelect({
  selected: view,
  setSelected: setView,
  column,
}: BaseFillSelectProps) {
  const [selectDisabled, setSelectDisabled] = useState(false)
  useEffect(() => {
    if (column?.foreignKeys?.table) {
      console.log("Foreign key detected:", column.foreignKeys, column.name)
      setView("foreign")
      setSelectDisabled(true)
    } else if (column.autoincrement) {
      console.log("Auto increment detected:", column.name)
      setView("autoincrement")
      setSelectDisabled(true)
    } else if (column.type.includes("VARCHAR")) {
      setView("faker")
    } else {
      setView("regex")
    }
  }, [])

  return (
    <Select value={view} onValueChange={setView}>
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
            <SelectItem value="sql">
              <div className="flex items-center">
                <Icon
                  icon="ph:file-sql"
                  className="mr-2 h-4 w-4 text-violet-400"
                />
                SQL Script
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
  const [highlighted, setHighlighted] = useState<string>("")
  const [focused, setFocused] = useState(false)
  const { theme } = useTheme()

  // useEffect(() => {
  //   if (selected) {
  //     se

  //   }
  // }, [selected])

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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
              <DropdownMenuItem
                onSelect={() => console.log("Export SQL")}
              >
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
