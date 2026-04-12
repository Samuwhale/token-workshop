import { createContext, useContext } from "react";
import type {
  DragEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
  Dispatch,
} from "react";

interface OptionDragTarget {
  dimId: string;
  optionName: string;
}

export interface ThemeAuthoringContextValue {
  collapsedDisabled: Set<string>;
  toggleCollapsedDisabled: (dimId: string) => void;
  dimSearch: string;
  setDimSearch: (value: string) => void;
  dimSearchRef: RefObject<HTMLInputElement | null>;
  secondaryToolsOpen: boolean;
  setSecondaryToolsOpen: Dispatch<SetStateAction<boolean>>;
  secondaryToolsRef: RefObject<HTMLDivElement | null>;
  dimensionRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  setRoleRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  tabScrollRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  tabScrollState: Record<string, { left: boolean; right: boolean }>;
  scrollOptionRail: (dimId: string, direction: "left" | "right") => void;
  addOptionInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  setShowAddOption: Dispatch<SetStateAction<Record<string, boolean>>>;
  setNewOptionNames: Dispatch<SetStateAction<Record<string, string>>>;
  setAddOptionErrors: Dispatch<SetStateAction<Record<string, string>>>;
  setCopyFromNewOption: Dispatch<SetStateAction<Record<string, string>>>;
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
  draggingOpt: OptionDragTarget | null;
  dragOverOpt: OptionDragTarget | null;
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
