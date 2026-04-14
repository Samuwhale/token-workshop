import { createContext, useContext } from "react";
import type {
  DragEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
  Dispatch,
} from "react";
import type { ThemeRoleState, ThemeOptionRoleSummary } from "../themeManagerTypes";
import type {
  ThemeIssueSummary,
} from "../../shared/themeWorkflow";


interface OptionDragTarget {
  dimId: string;
  optionName: string;
}

interface OptionRenameTarget {
  dimId: string;
  optionName: string;
}

export interface ThemeAuthoringContextValue {
  // --- UI state (local to ThemeAuthoringScreen) ---
  collapsedDisabled: Set<string>;
  toggleCollapsedDisabled: (dimId: string) => void;
  dimSearch: string;
  setDimSearch: (value: string) => void;
  dimSearchRef: RefObject<HTMLInputElement | null>;
  dimensionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  setRoleRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  tabScrollRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  tabScrollState: Record<string, { left: boolean; right: boolean }>;
  scrollOptionRail: (dimId: string, direction: "left" | "right") => void;
  addOptionInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;

  // --- Drag & drop ---
  draggingOpt: OptionDragTarget | null;
  dragOverOpt: OptionDragTarget | null;
  handleOptDragStart: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDragOver: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDrop: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDragEnd: () => void;

  // --- Dimension CRUD ---
  renameDim: string | null;
  renameValue: string;
  renameError: string | null;
  setRenameValue: (value: string) => void;
  startRenameDim: (dimId: string, currentName: string) => void;
  cancelRenameDim: () => void;
  executeRenameDim: () => void;
  openDeleteConfirm: (dimId: string) => void;
  handleDuplicateDimension: (dimId: string) => void;
  isDuplicatingDim: boolean;
  handleMoveDimension: (dimId: string, direction: "up" | "down") => void;
  newlyCreatedDim: string | null;

  // --- Option CRUD ---
  newOptionNames: Record<string, string>;
  showAddOption: Record<string, boolean>;
  addOptionErrors: Record<string, string>;
  copyFromNewOption: Record<string, string>;
  setShowAddOption: Dispatch<SetStateAction<Record<string, boolean>>>;
  setNewOptionNames: Dispatch<SetStateAction<Record<string, string>>>;
  setAddOptionErrors: Dispatch<SetStateAction<Record<string, string>>>;
  setCopyFromNewOption: Dispatch<SetStateAction<Record<string, string>>>;
  handleAddOption: (dimId: string) => void;
  renameOption: OptionRenameTarget | null;
  renameOptionValue: string;
  renameOptionError: string | null;
  startRenameOption: (dimId: string, optionName: string) => void;
  setRenameOptionValue: (value: string) => void;
  setRenameOptionError: (value: string | null) => void;
  executeRenameOption: () => void;
  cancelRenameOption: () => void;
  handleDuplicateOption: (dimId: string, optionName: string) => void;
  setOptionDeleteConfirm: (target: OptionRenameTarget | null) => void;
  handleMoveOption: (
    dimId: string,
    optionName: string,
    direction: "up" | "down",
  ) => void;

  // --- Selection ---
  onSelectDimension: (dimId: string) => void;
  onSelectOption: (dimId: string, optionName: string) => void;
  selectedOptions: Record<string, string>;

  // --- Data (shared across all cards) ---
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  optionIssues: Record<string, ThemeIssueSummary[]>;

  // --- Set operations ---
  getCopySourceOptions: (dimId: string, optionName: string) => string[];
  handleSetState: (
    dimId: string,
    optionName: string,
    setName: string,
    nextState: ThemeRoleState,
  ) => void;
  handleCopyAssignmentsFrom: (
    dimId: string,
    optionName: string,
    sourceOptionName: string,
  ) => void;
  handleAutoFillAll: (dimId: string, optionName: string) => void;
  handleAutoFillAllOptions: (dimId: string) => void;

  // --- Navigation ---
  onOpenCompare: (dimId?: string) => void;
  onOpenResolver: () => void;
  onNavigateToTokenSet?: (setName: string) => void;
  onGenerateForDimension?: (info: {
    dimensionName: string;
    targetSet: string;
  }) => void;
}

const ThemeAuthoringContext =
  createContext<ThemeAuthoringContextValue | null>(null);

export function ThemeAuthoringProvider({
  value,
  children,
}: {
  value: ThemeAuthoringContextValue;
  children: React.ReactNode;
}) {
  return (
    <ThemeAuthoringContext.Provider value={value}>
      {children}
    </ThemeAuthoringContext.Provider>
  );
}

export function useThemeAuthoringContext(): ThemeAuthoringContextValue {
  const value = useContext(ThemeAuthoringContext);
  if (!value) {
    throw new Error(
      "useThemeAuthoringContext must be used inside ThemeAuthoringProvider",
    );
  }
  return value;
}
