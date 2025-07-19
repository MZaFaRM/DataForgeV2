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

interface DBColumnProps {
  column: ColumnData
  columnSpec: ColumnSpec
  setColumnSpec: (newSpec: ColumnSpec) => void
  fakerMethods: string[]
  hoveredGroup: string[] | null
  setHoveredGroup: (group: string[] | null) => void
}

export default function DBColumn({
  column,
  columnSpec,
  setColumnSpec,
  fakerMethods,
  hoveredGroup,
  setHoveredGroup,
}: DBColumnProps) {
  const thisGroup = column.multiUnique || column.unique ? [column.name] : []
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
            : thisGroup.length > 0
              ? "is unique"
              : ""

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

      {/* <TableCell>
        <RenderNullChanceControl
          nullReason={nullReason}
          nullProbability={columnSpec.nullChance * 10}
          setNullProbability={(val) =>
            setColumnSpec({ ...columnSpec, nullChance: val / 10 })
          }
        />
      </TableCell> */}

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

  return generatorTypeSelect === "faker" ? (
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
            className="w-[200px] justify-between"
            disabled
          >
            {column.foreignKeys.table}.{column.foreignKeys.column}
            <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </span>
      </PopoverTrigger>
    </Popover>
  ) : generatorTypeSelect === "regex" ? (
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
  ) : generatorTypeSelect === "python" ? (
    <div className="overflow-auto rounded border">
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
        onChange={(value) => {
          console.log(value)
          setSelected(value)
        }}
        extensions={[python()]}
        theme={theme === "light" ? githubLight : githubDark}
        height="auto"
        minHeight="35px"
        maxHeight="200px"
        maxWidth="350px"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
      />
    </div>
  ) : generatorTypeSelect === "sql" ? (
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
