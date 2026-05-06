import { useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2, X } from "lucide-react";
import { DIMENSION_UNITS, type TokenCollection } from "@token-workshop/core";
import type { TokenMapEntry } from "../../../shared/types";
import { Button, SegmentedControl } from "../../primitives";
import { AUTHORING } from "../../shared/editorClasses";
import { BooleanEditor } from "../valueEditors/BooleanEditor";
import { ColorEditor } from "../valueEditors/ColorEditor";
import { DimensionEditor, StepperInput } from "../valueEditors/DimensionEditor";
import { FormulaInput } from "../FormulaInput";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import { validateGeneratorTokenPath } from "./generatorValidation";

export type GeneratorTokenRefs = Record<string, string>;
export type GeneratorDimensionInputValue = { value: number | string; unit: string };

const TOKEN_REF_OPTIONS = [
  { value: "literal", label: "Literal" },
  { value: "token", label: "Token" },
];

const LIST_TYPE_OPTIONS = ["number", "dimension", "color", "string", "boolean", "token"] as const;

export function FieldBlock({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  const labelId = useId();
  const errorId = useId();
  return (
    <div className="block">
      <span
        id={labelId}
        className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
      >
        {children}
      </div>
      {error ? (
        <span
          id={errorId}
          className="mt-1 block text-tertiary text-[color:var(--color-figma-text-error)]"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function GeneratorTextField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  return (
    <FieldBlock label={label} error={error}>
      <input
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="tm-generator-field text-secondary"
      />
    </FieldBlock>
  );
}

export function GeneratorPathField({
  label,
  value,
  onChange,
  series,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  series?: boolean;
}) {
  const text = String(value ?? "");
  const error = validateGeneratorTokenPath(text);
  return (
    <FieldBlock label={label} error={error}>
      <input
        value={text}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="tm-generator-field text-secondary"
      />
      {text.trim() && !error ? (
        <div className="mt-1 truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
          {series ? `${text}.<step>` : text}
        </div>
      ) : null}
    </FieldBlock>
  );
}

export function GeneratorNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: number) => void;
}) {
  return (
    <FieldBlock label={label}>
      <StepperInput
        value={toFiniteNumber(value, 0)}
        onChange={onChange}
        ariaLabel={label}
      />
    </FieldBlock>
  );
}

export function GeneratorColorField({
  label,
  value,
  onChange,
  allTokensFlat,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
}) {
  return (
    <FieldBlock label={label}>
      <ColorEditor
        value={typeof value === "string" && value.trim() ? value : "#000000"}
        onChange={onChange}
        allTokensFlat={allTokensFlat}
      />
    </FieldBlock>
  );
}

export function GeneratorDimensionField({
  label,
  value,
  unit,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: {
  label: string;
  value: unknown;
  unit?: unknown;
  onChange: (value: GeneratorDimensionInputValue) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}) {
  const dimensionValue =
    value && typeof value === "object" && "value" in value && "unit" in value
      ? value
      : { value: toFiniteNumber(value, 0), unit: String(unit ?? "px") };
  return (
    <FieldBlock label={label}>
      <DimensionEditor
        value={dimensionValue}
        onChange={onChange}
        allTokensFlat={allTokensFlat}
        pathToCollectionId={pathToCollectionId}
        allowFormula={false}
      />
    </FieldBlock>
  );
}

export function parseGeneratorDimensionInput(value: unknown): GeneratorDimensionInputValue {
  if (value && typeof value === "object" && "value" in value && "unit" in value) {
    const record = value as { value: unknown; unit: unknown };
    return {
      value: toFiniteNumber(record.value, 0),
      unit: String(record.unit || "px"),
    };
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  return {
    value: match ? toFiniteNumber(match[1], 0) : toFiniteNumber(text, 0),
    unit: match?.[2] ?? "px",
  };
}

export function formatGeneratorDimensionInput(value: GeneratorDimensionInputValue): string {
  return `${value.value}${value.unit}`;
}

export function GeneratorBooleanField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: boolean) => void;
}) {
  return (
    <FieldBlock label={label}>
      <BooleanEditor value={Boolean(value)} onChange={onChange} />
    </FieldBlock>
  );
}

export function GeneratorFormulaField({
  label,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}) {
  return (
    <FieldBlock label={label}>
      <FormulaInput
        value={String(value ?? "")}
        onChange={onChange}
        allTokensFlat={allTokensFlat}
        pathToCollectionId={pathToCollectionId}
        placeholder="base * multiplier"
      />
    </FieldBlock>
  );
}

export function GeneratorUnitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <FieldBlock label={label}>
      <select
        value={String(value ?? "px")}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="tm-generator-field text-secondary"
      >
        {DIMENSION_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </FieldBlock>
  );
}

export function ReferenceableField({
  fieldKey,
  refs,
  collectionId,
  collections,
  perCollectionFlat,
  tokenTypes,
  onRefsChange,
  children,
}: {
  fieldKey: string;
  refs: GeneratorTokenRefs;
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  tokenTypes?: string[];
  onRefsChange: (refs: GeneratorTokenRefs) => void;
  children: ReactNode;
}) {
  const hasRef = Object.prototype.hasOwnProperty.call(refs, fieldKey);
  const refPath = refs[fieldKey] ?? "";
  const mode = hasRef ? "token" : "literal";
  const firstTokenPath = firstCompatibleTokenPath(
    collectionId,
    perCollectionFlat,
    tokenTypes,
  );
  return (
    <div className="space-y-2">
      <SegmentedControl
        value={mode}
        options={TOKEN_REF_OPTIONS}
        ariaLabel={`${fieldKey} value source`}
        onChange={(nextMode) => {
          if (nextMode === "literal") {
            const nextRefs = { ...refs };
            delete nextRefs[fieldKey];
            onRefsChange(nextRefs);
            return;
          }
          const nextPath = refPath || firstTokenPath;
          if (!nextPath) return;
          onRefsChange({ ...refs, [fieldKey]: nextPath });
        }}
      />
      {mode === "token" ? (
        <GeneratorTokenPicker
          value={refPath}
          collectionId={collectionId}
          collections={collections}
          perCollectionFlat={perCollectionFlat}
          tokenTypes={tokenTypes}
          onChange={(path) => onRefsChange({ ...refs, [fieldKey]: path })}
        />
      ) : (
        children
      )}
      {mode === "literal" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!firstTokenPath) return;
            onRefsChange({ ...refs, [fieldKey]: firstTokenPath });
          }}
          disabled={!firstTokenPath}
        >
          Use token
        </Button>
      ) : null}
    </div>
  );
}

function firstCompatibleTokenPath(
  collectionId: string,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  tokenTypes?: string[],
): string | null {
  return Object.entries(perCollectionFlat[collectionId] ?? {})
    .filter(([, token]) => !tokenTypes || tokenTypes.includes(token.$type))
    .map(([path]) => path)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function GeneratorTokenPicker({
  value,
  collectionId,
  collections,
  perCollectionFlat,
  tokenTypes,
  onChange,
}: {
  value: string;
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  tokenTypes?: string[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const collection = collections.find((candidate) => candidate.id === collectionId);
  const modes = collection?.modes.map((mode) => mode.name) ?? [];
  const entries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return Object.entries(perCollectionFlat[collectionId] ?? {})
      .filter(([, token]) => !tokenTypes || tokenTypes.includes(token.$type))
      .filter(
        ([path, token]) =>
          !normalized ||
          path.toLowerCase().includes(normalized) ||
          token.$type.toLowerCase().includes(normalized),
      )
      .sort(([a], [b]) => a.localeCompare(b));
  }, [collectionId, perCollectionFlat, query, tokenTypes]);
  const selected = value ? perCollectionFlat[collectionId]?.[value] : undefined;
  return (
    <div className="space-y-2">
      <div className="tm-generator-field">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={value || "Search tokens"}
          aria-label="Search tokens"
          className="w-full bg-transparent text-secondary outline-none"
        />
      </div>
      {selected ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Clear selected token ${value}`}
          className="flex w-full items-start gap-2 rounded-md bg-[var(--color-figma-bg-selected)] px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
        >
          <TokenPickerContent path={value} token={selected} collectionId={collectionId} modes={modes} />
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
            <X size={12} />
            Clear
          </span>
        </button>
      ) : null}
      <div className="max-h-[180px] overflow-y-auto py-1">
        {entries.slice(0, 40).map(([path, token]) => (
          <button
            key={path}
            type="button"
            onClick={() => {
              onChange(path);
              setQuery("");
            }}
            className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
          >
            <TokenPickerContent path={path} token={token} collectionId={collectionId} modes={modes} />
          </button>
        ))}
      </div>
    </div>
  );
}

function TokenPickerContent({
  path,
  token,
  collectionId,
  modes,
}: {
  path: string;
  token: TokenMapEntry;
  collectionId: string;
  modes: string[];
}) {
  const values = readTokenModeValues(token, collectionId, modes).slice(0, 3);
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{path}</span>
      <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
        {token.$type}
      </span>
      <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-tertiary text-[color:var(--color-figma-text-secondary)]">
        {values.map(([modeName, modeValue]) => (
          <span key={modeName} className="flex min-w-0 items-center gap-1">
            {previewIsValueBearing(token.$type) ? (
              <ValuePreview type={token.$type} value={modeValue} size={12} />
            ) : null}
            <span className="truncate">
              {modeName}: {formatCompactValue(modeValue)}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

export function NumberStepTable({
  label,
  values,
  pathPrefix,
  onChange,
}: {
  label: string;
  values: number[];
  pathPrefix?: string;
  onChange: (values: number[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <StepTableHeader label={label} onAdd={() => onChange([...values, 0])} />
      <div className="space-y-1">
        {values.map((value, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 py-1">
            <StepperInput
              value={toFiniteNumber(value, 0)}
              onChange={(nextValue) => onChange(replaceAt(values, index, nextValue))}
              ariaLabel={`${label} step ${index + 1} value`}
            />
            <StepActions
              canMoveUp={index > 0}
              canMoveDown={index < values.length - 1}
              onDuplicate={() => onChange(insertAt(values, index + 1, value))}
              onMoveUp={() => onChange(moveItem(values, index, index - 1))}
              onMoveDown={() => onChange(moveItem(values, index, index + 1))}
              onRemove={() => onChange(removeAt(values, index))}
            />
            {pathPrefix ? (
              <div className="col-span-2 truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
                {pathPrefix}.{value}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NamedNumberStepTable({
  label,
  values,
  valueKey,
  optionalValueKey,
  pathPrefix,
  onChange,
}: {
  label: string;
  values: Record<string, unknown>[];
  valueKey: string;
  optionalValueKey?: string;
  pathPrefix?: string;
  onChange: (values: Record<string, unknown>[]) => void;
}) {
  const duplicateNames = duplicateStepNames(values);
  return (
    <div className="space-y-1.5">
      <StepTableHeader
        label={label}
        onAdd={() =>
          onChange([...values, { name: `step-${values.length + 1}`, [valueKey]: 0 }])
        }
      />
      <div className="space-y-1">
        {values.map((step, index) => {
          const name = String(step.name ?? "");
          const error = validateStepName(name, duplicateNames);
          return (
            <div key={index} className="space-y-1 py-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,1fr)_72px] items-center gap-2">
                <input
                  value={name}
                  onChange={(event) => onChange(updateStep(values, index, { name: event.target.value }))}
                  placeholder="name"
                  aria-label={`${label} step ${index + 1} name`}
                  className="tm-generator-field min-w-0 text-secondary"
                />
                <StepperInput
                  value={toFiniteNumber(step[valueKey], 0)}
                  onChange={(nextValue) => onChange(updateStep(values, index, { [valueKey]: nextValue }))}
                  ariaLabel={`${label} step ${index + 1} ${valueKey}`}
                />
                <StepActions
                  canMoveUp={index > 0}
                  canMoveDown={index < values.length - 1}
                  onDuplicate={() => onChange(insertAt(values, index + 1, { ...step, name: `${name || "step"}-copy` }))}
                  onMoveUp={() => onChange(moveItem(values, index, index - 1))}
                  onMoveDown={() => onChange(moveItem(values, index, index + 1))}
                  onRemove={() => onChange(removeAt(values, index))}
                />
              </div>
              {optionalValueKey ? (
                <input
                  type="number"
                  value={step[optionalValueKey] == null ? "" : String(step[optionalValueKey])}
                  onChange={(event) => onChange(updateStep(values, index, optionalNumberPatch(optionalValueKey, event.target.value)))}
                  placeholder={optionalValueKey}
                  aria-label={`${label} step ${index + 1} ${optionalValueKey}`}
                  className="tm-generator-field text-tertiary"
                />
              ) : null}
              {pathPrefix || error ? (
                <div className={`truncate text-tertiary ${error ? "text-[color:var(--color-figma-text-error)]" : "text-[color:var(--color-figma-text-secondary)]"}`}>
                  {error ?? `${pathPrefix}.${name}`}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ShadowStepTable({
  values,
  pathPrefix,
  onChange,
}: {
  values: Record<string, unknown>[];
  pathPrefix?: string;
  onChange: (values: Record<string, unknown>[]) => void;
}) {
  const duplicateNames = duplicateStepNames(values);
  const fields = ["offsetX", "offsetY", "blur", "spread", "opacity"];
  return (
    <div className="space-y-1.5">
      <StepTableHeader
        label="Steps"
        onAdd={() =>
          onChange([
            ...values,
            { name: `step-${values.length + 1}`, offsetX: 0, offsetY: 2, blur: 8, spread: 0, opacity: 0.2 },
          ])
        }
      />
      <div className="space-y-1">
        {values.map((step, index) => {
          const name = String(step.name ?? "");
          const error = validateStepName(name, duplicateNames);
          return (
            <div key={index} className="space-y-1 py-1.5">
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(event) => onChange(updateStep(values, index, { name: event.target.value }))}
                  placeholder="name"
                  aria-label={`Shadow step ${index + 1} name`}
                  className="tm-generator-field min-w-0 flex-1 text-secondary font-medium"
                />
                <StepActions
                  canMoveUp={index > 0}
                  canMoveDown={index < values.length - 1}
                  onDuplicate={() => onChange(insertAt(values, index + 1, { ...step, name: `${name || "step"}-copy` }))}
                  onMoveUp={() => onChange(moveItem(values, index, index - 1))}
                  onMoveDown={() => onChange(moveItem(values, index, index + 1))}
                  onRemove={() => onChange(removeAt(values, index))}
                />
              </div>
              <div className="grid grid-cols-5 gap-1">
                {fields.map((field) => (
                  <input
                    key={field}
                    type="number"
                    value={toFiniteNumber(step[field], 0)}
                    title={field}
                    aria-label={`Shadow step ${index + 1} ${field}`}
                    onChange={(event) => onChange(updateStep(values, index, { [field]: Number(event.target.value) }))}
                    className="tm-generator-field min-w-0 px-1 text-tertiary"
                  />
                ))}
              </div>
              {pathPrefix || error ? (
                <div className={`truncate text-tertiary ${error ? "text-[color:var(--color-figma-text-error)]" : "text-[color:var(--color-figma-text-secondary)]"}`}>
                  {error ?? `${pathPrefix}.${name}`}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GeneratorListValueEditor({
  type,
  items,
  collectionId,
  collections,
  perCollectionFlat,
  onTypeChange,
  onChange,
}: {
  type: string;
  items: unknown[];
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onTypeChange: (type: string, items: unknown[]) => void;
  onChange: (items: unknown[]) => void;
}) {
  const rows = normalizeListRows(items, type);
  return (
    <div className="space-y-2">
      <FieldBlock label="List type">
        <select
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            onTypeChange(nextType, retargetListRows(rows, nextType));
          }}
          aria-label="List type"
          className="tm-generator-field text-secondary"
        >
          {LIST_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </FieldBlock>
      <StepTableHeader
        label="Items"
        onAdd={() => onChange([...rows, defaultListRow(type, rows.length)])}
      />
      <div className="space-y-1">
        {rows.map((row, index) => (
          <div key={index} className="space-y-1 py-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_72px] items-start gap-2">
              <ListValueControl
                type={type}
                row={row}
                collectionId={collectionId}
                collections={collections}
                perCollectionFlat={perCollectionFlat}
                onChange={(nextRow) => onChange(replaceAt(rows, index, nextRow))}
              />
              <StepActions
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                onDuplicate={() => onChange(insertAt(rows, index + 1, { ...row, key: `${row.key}-copy`, label: `${row.label} copy` }))}
                onMoveUp={() => onChange(moveItem(rows, index, index - 1))}
                onMoveDown={() => onChange(moveItem(rows, index, index + 1))}
                onRemove={() => onChange(removeAt(rows, index))}
              />
            </div>
            <input
              value={String(row.label ?? "")}
              onChange={(event) => onChange(replaceAt(rows, index, { ...row, label: event.target.value, key: event.target.value || row.key }))}
              placeholder="label"
              aria-label={`List item ${index + 1} label`}
              className="tm-generator-field text-tertiary"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListValueControl({
  type,
  row,
  collectionId,
  collections,
  perCollectionFlat,
  onChange,
}: {
  type: string;
  row: Record<string, unknown>;
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onChange: (row: Record<string, unknown>) => void;
}) {
  if (type === "color") {
    return <ColorEditor value={String(row.value ?? "#000000")} onChange={(value) => onChange({ ...row, value })} />;
  }
  if (type === "number") {
    return <StepperInput value={toFiniteNumber(row.value, 0)} onChange={(value) => onChange({ ...row, value })} ariaLabel="List item value" />;
  }
  if (type === "dimension") {
    return (
      <DimensionEditor
        value={row.value && typeof row.value === "object" ? row.value : { value: toFiniteNumber(row.value, 0), unit: "px" }}
        onChange={(value) => onChange({ ...row, value })}
        allowFormula={false}
      />
    );
  }
  if (type === "boolean") {
    return <BooleanEditor value={Boolean(row.value)} onChange={(value) => onChange({ ...row, value })} />;
  }
  if (type === "token") {
    const value = String(row.value ?? "").replace(/^\{|\}$/g, "");
    const selectedToken = perCollectionFlat[collectionId]?.[value];
    return (
      <GeneratorTokenPicker
        value={value}
        collectionId={collectionId}
        collections={collections}
        perCollectionFlat={perCollectionFlat}
        onChange={(path) =>
          onChange({
            ...row,
            value: path ? `{${path}}` : "",
            type: path ? perCollectionFlat[collectionId]?.[path]?.$type ?? selectedToken?.$type ?? "token" : "token",
          })
        }
      />
    );
  }
  return (
    <input
      value={String(row.value ?? "")}
      onChange={(event) => onChange({ ...row, value: event.target.value })}
      className={AUTHORING.input}
    />
  );
}

function StepTableHeader({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
        {label}
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        title={`Add ${label.toLowerCase()}`}
        aria-label={`Add ${label.toLowerCase()}`}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function StepActions({
  canMoveUp,
  canMoveDown,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <IconStepButton title="Duplicate" onClick={onDuplicate}>
        <Copy size={11} />
      </IconStepButton>
      <IconStepButton title="Move up" onClick={onMoveUp} disabled={!canMoveUp}>
        <ChevronUp size={12} />
      </IconStepButton>
      <IconStepButton title="Move down" onClick={onMoveDown} disabled={!canMoveDown}>
        <ChevronDown size={12} />
      </IconStepButton>
      <IconStepButton title="Remove" onClick={onRemove}>
        <Trash2 size={11} />
      </IconStepButton>
    </div>
  );
}

function IconStepButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function readTokenModeValues(
  token: TokenMapEntry,
  collectionId: string,
  modes: string[],
): Array<[string, unknown]> {
  if (modes.length === 0) return [["Value", token.$value]];
  const collectionModes = token.$extensions?.tokenworkshop?.modes?.[collectionId];
  return modes.map((modeName, index) => [
    modeName,
    index === 0 ? token.$value : collectionModes?.[modeName],
  ]);
}

function formatCompactValue(value: unknown): string {
  if (value == null) return "No value";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function validateStepName(name: string, duplicateNames: Set<string>): string | null {
  if (!name.trim()) return "Step name is required.";
  if (name.startsWith("$")) return "Step name cannot start with $.";
  if (name.includes(".")) return "Step name cannot contain dots.";
  if (/[\\/]/.test(name)) return "Step name cannot contain slashes.";
  if (duplicateNames.has(name)) return "Step name must be unique.";
  return null;
}

function duplicateStepNames(values: Record<string, unknown>[]): Set<string> {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    const name = String(value.name ?? "");
    if (!name) continue;
    if (seen.has(name)) duplicate.add(name);
    seen.add(name);
  }
  return duplicate;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function insertAt<T>(items: T[], index: number, value: T): T[] {
  return [...items.slice(0, index), value, ...items.slice(index)];
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_item, itemIndex) => itemIndex !== index);
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function updateStep(
  values: Record<string, unknown>[],
  index: number,
  patch: Record<string, unknown>,
): Record<string, unknown>[] {
  return values.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function optionalNumberPatch(key: string, value: string): Record<string, unknown> {
  if (!value.trim()) return { [key]: undefined };
  return { [key]: Number(value) };
}

function normalizeListRows(items: unknown[], type: string): Record<string, unknown>[] {
  return items.map((item, index) => {
    if (item && typeof item === "object" && !Array.isArray(item) && "value" in item) {
      const row = item as Record<string, unknown>;
      return {
        key: String(row.key ?? index + 1),
        label: String(row.label ?? row.key ?? index + 1),
        value: row.value,
        type: row.type ?? type,
      };
    }
    return {
      key: String(index + 1),
      label: String(index + 1),
      value: item,
      type,
    };
  });
}

function defaultListRow(type: string, index: number): Record<string, unknown> {
  const key = String(index + 1);
  if (type === "color") return { key, label: key, value: "#000000", type };
  if (type === "dimension") return { key, label: key, value: { value: 0, unit: "px" }, type };
  if (type === "boolean") return { key, label: key, value: false, type };
  if (type === "string" || type === "token") return { key, label: key, value: "", type };
  return { key, label: key, value: 0, type };
}

function retargetListRows(rows: Record<string, unknown>[], type: string): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    type,
    value: normalizeListValueForType(row.value, type),
  }));
}

function normalizeListValueForType(value: unknown, type: string): unknown {
  if (type === "color") {
    return typeof value === "string" && value.trim() ? value : "#000000";
  }
  if (type === "number") return toFiniteNumber(value, 0);
  if (type === "dimension") {
    return value && typeof value === "object" && "value" in value && "unit" in value
      ? value
      : { value: toFiniteNumber(value, 0), unit: "px" };
  }
  if (type === "boolean") return Boolean(value);
  if (type === "token") {
    return typeof value === "string" && value.startsWith("{") ? value : "";
  }
  return value == null ? "" : String(value);
}
