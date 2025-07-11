import { useEffect, useRef, useState } from "react"
import { invokeTableData } from "@/api/db"
import { invokeGetFakerMethods } from "@/api/fill"
import { Icon } from "@iconify/react"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"
import { getCurrentWindow } from "@tauri-apps/api/window"

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
import { ColumnData, DbData, TableData } from "@/components/types"

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
  const [availableHeight, setAvailableHeight] = useState("")
  const [availableWidth, setAvailableWidth] = useState("")
  const [timeOfDay, setTimeOfDay] = useState<
    "sunrise" | "sunset" | "moonrise" | "moonset"
  >("sunrise")
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [fakerMethods, setFakerMethods] = useState<string[]>([])
  const [hoveredGroup, setHoveredGroup] = useState<string[] | null>(null)

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
          <>
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
          </>
        )}
      </div>
      <div className="relative flex h-full w-full flex-col overflow-auto rounded border">
        {tableData && tableData.columns ? (
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
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              icon={`meteocons:${timeOfDay}`}
              className="margin-auto h-16 w-16"
            />
          </div>
        )}
        <div className="absolute bottom-2 right-2 opacity-50 hover:opacity-100">
          <Tabs defaultValue="account" className="w-full">
            <TabsList>
              <TabsTrigger value="account">Insert</TabsTrigger>
              <TabsTrigger value="password">View</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

interface DataImportProps {
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
}: DataImportProps) {
  const [baseSelect, setBaseSelect] = useState("foreign")
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
          title={
            nullReason || `${nullProbability}% inserted values will be null`
          }
        >
          <Popover>
            <PopoverTrigger asChild disabled={Boolean(nullReason)}>
              <Icon
                icon="tabler:salt"
                className={cn(
                  "ml-2 h-4 w-4",
                  nullReason
                    ? "cursor-not-allowed text-stone-500"
                    : "cursor-pointer"
                )}
              />
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
    <Input
      type="text"
      placeholder="Enter regex"
      className="w-[200px]"
      value={selected ?? ""}
      onChange={(e) => setSelected(e.target.value)}
    />
  ) : null
}
