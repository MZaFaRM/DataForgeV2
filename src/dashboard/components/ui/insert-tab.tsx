import { Dispatch, SetStateAction, useEffect, useState } from "react"
import { python } from "@codemirror/lang-python"
import { sql } from "@codemirror/lang-sql"
import { Icon } from "@iconify/react"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import CodeMirror, { EditorView } from "@uiw/react-codemirror"
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
import { TableCell, TableRow } from "@/components/ui/table"
import { ColumnData, ColumnSpec, GeneratorType } from "@/components/types"

interface InsertTabProps {
  column: ColumnData
  columnSpec: ColumnSpec
  setColumnSpec: (newSpec: ColumnSpec) => void
  fakerMethods: string[]
  hoveredGroup: string[] | null
  setHoveredGroup: (group: string[] | null) => void
}

export default function InsertTab({
  column,
  columnSpec,
  setColumnSpec,
  fakerMethods,
  hoveredGroup,
  setHoveredGroup,
}: InsertTabProps) {
  const thisGroup = column.multiUnique || column.unique ? [column.name] : []
  const inHovered = hoveredGroup?.includes(column.name)


  return (
    <TableRow
      onMouseEnter={() => {
        setHoveredGroup(thisGroup ?? null)
      }}
      onMouseLeave={() => setHoveredGroup(null)}
    >
      <TableCell>
        <div
          className={cn(
            "flex items-center",
            inHovered && "font-medium text-lime-500",
            column.primaryKey && "text-purple-500"
          )}
        >
          {column.name}
          <div className="ml-2 flex items-center space-x-1">
            {column.primaryKey ? (
              <div className="rounded border p-1 text-xs font-medium text-current">
                PK
              </div>
            ) : thisGroup.length == 1 ? (
              <div className="rounded border p-1 text-xs font-medium text-current">
                UQ
              </div>
            ) : (
              thisGroup.length > 1 && (
                <div className="rounded border p-1 text-xs font-medium text-current">
                  UQG
                </div>
              )
            )}
            {!column.nullable && (
              <div className="rounded border p-1 text-xs font-medium text-current">
                NN
              </div>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>{column.type}</TableCell>

      <TableCell>
        <GeneratorTypeSelect
          selected={columnSpec.type}
          setSelected={(val) =>
            setColumnSpec({ ...columnSpec, type: val, generator: null })
          }
          column={column}
        />
      </TableCell>

      <TableCell>
        <RenderGenerator
          column={column}
          generatorTypeSelect={columnSpec.type}
          selected={columnSpec.generator}
          setSelected={(val) =>
            setColumnSpec({ ...columnSpec, generator: val })
          }
          fakerMethods={fakerMethods}
        />
      </TableCell>
    </TableRow>
  )
}

interface GeneratorTypeSelectProps {
  selected: GeneratorType
  setSelected: (view: GeneratorType) => void
  column: ColumnData
}

function GeneratorTypeSelect({
  selected,
  setSelected,
  column,
}: GeneratorTypeSelectProps) {
  useEffect(() => {
    if (column.foreignKeys?.table) {
      setSelected("foreign")
    } else if (column.autoincrement) {
      setSelected("autoincrement")
    } else if (column.computed) {
      setSelected("computed")
    }
  }, [column])

  return (
    <Select
      value={selected}
      onValueChange={(val) => setSelected(val as GeneratorType)}
    >
      <SelectTrigger className="w-[180px]">
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
                Library
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

interface RenderGeneratorProps {
  column: ColumnData
  generatorTypeSelect: string
  selected: string | null
  setSelected: (value: string | null) => void
  fakerMethods: string[]
}

function RenderGenerator({
  column,
  generatorTypeSelect,
  selected,
  setSelected,
  fakerMethods,
}: RenderGeneratorProps) {
  const [open, setOpen] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    if (generatorTypeSelect === "foreign") {
      setSelected(`${column.foreignKeys?.table}__${column.foreignKeys?.column}`)
    } else if (generatorTypeSelect === "autoincrement") {
      setSelected("autoincrement")
    } else if (generatorTypeSelect === "computed") {
      setSelected("computed")
    }
  }, [generatorTypeSelect])

  return generatorTypeSelect === "faker" ? (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[350px] justify-between")}
        >
          <div
            className={cn(
              "flex items-center",
              selected ? "text-white" : "text-muted-foreground"
            )}
          >
            <Icon icon="mdi:collection" className="mr-2 h-4 w-4" />
            {selected ?? "Select item"}
          </div>
          <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0">
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
  ) : generatorTypeSelect === "foreign" ? (
    <Popover open={false}>
      <PopoverTrigger asChild>
        <span
          title={`Table: ${column.foreignKeys.table} Column: ${column.foreignKeys.column}`}
        >
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={false}
            className="w-[350px] justify-start text-left"
            disabled
          >
            <Icon icon="tabler:table-filled" className="mr-2 h-4 w-4" />
            {column.foreignKeys.table}__{column.foreignKeys.column}
          </Button>
        </span>
      </PopoverTrigger>
    </Popover>
  ) : generatorTypeSelect === "regex" ? (
    <div className="w-[350px] overflow-auto rounded border">
      <div className="flex items-stretch bg-muted">
        <div className="flex w-10">
          <Icon icon="mingcute:up-fill" className="m-auto h-4 w-4" />
        </div>
        <Input
          placeholder={"Regex (Python engine)"}
          value={selected ? selected.slice(1, -1) : ""}
          onChange={(e) => setSelected("^" + e.target.value + "$")}
          height="auto"
          className="rounded-none border-0 text-green-400"
        />
        <div className="flex w-10">
          <Icon icon="bx:dollar" className="m-auto h-4 w-4" />
        </div>
      </div>
    </div>
  ) : generatorTypeSelect === "python" ? (
    <div className="w-[350px] overflow-clip rounded border">
      <CodeMirror
        placeholder={
          "# import builtins + faker\n" +
          "# Py fields run after faker/foreign/regex/etc\n" +
          "# @order(int) → set execution order\n" +
          "# def generator(columns):\n" +
          '#   return columns["name"].lower() + "@x.com"\n\n'
        }
        value={
          selected ||
          "# import builtins + faker\n" +
            "# Py fields run after faker/foreign/regex/etc\n" +
            "# @order(int) → set execution order\n" +
            "# def generator(columns):\n" +
            '#   return columns["name"].lower() + "@x.com"\n'
        }
        onChange={setSelected}
        extensions={[python()]}
        theme={theme === "light" ? githubLight : githubDark}
        height="auto"
        minHeight="50px"
        maxHeight="200px"
        maxWidth="350px"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
      />
    </div>
  ) : null
}
