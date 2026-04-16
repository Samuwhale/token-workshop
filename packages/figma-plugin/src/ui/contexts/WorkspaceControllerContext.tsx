import { createContext, useContext } from "react";
import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { TokenListImperativeHandle } from "../components/tokenListTypes";
import type { CollectionManagerHandle } from "../components/CollectionManager";
import type { PublishPanelHandle } from "../components/PublishPanel";
import type { StartHereBranch } from "../components/WelcomePrompt";
import type { LintViolation } from "../hooks/useLint";
import type {
  ValidationIssue,
  ValidationSnapshot,
  ValidationSummary,
} from "../hooks/useValidationCache";
import type { OperationEntry } from "../hooks/useRecentOperations";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenNode } from "../hooks/useTokens";
import type { RecentlyTouchedState } from "../hooks/useRecentlyTouched";
import type { StarredTokensState } from "../hooks/useStarredTokens";
import type { NotificationEntry } from "../hooks/useToastStack";
import type { ImportCompletionResult } from "../components/ImportPanelContext";
import type {
  SurfaceTransition,
} from "../shared/navigationTypes";

export interface ShellWorkspaceController {
  showPreviewSplit: boolean;
  setShowPreviewSplit: Dispatch<SetStateAction<boolean>>;
  openCommandPaletteWithQuery: (query: string) => void;
  openPasteModal: () => void;
  openImportPanel: () => void;
  openSetCreateDialog: () => void;
  openColorScaleRecipe: () => void;
  toggleQuickApply: () => void;
  toggleSetSwitcher: () => void;
  openStartHere: (branch?: StartHereBranch) => void;
  restartGuidedSetup: () => void;
  handleClearAllComplete: () => void;
  handleImportComplete: (result: ImportCompletionResult) => void;
  notificationHistory: NotificationEntry[];
  clearNotificationHistory: () => void;
}

export interface EditorShellController {
  useSidePanel: boolean;
  contextualEditorTransition: SurfaceTransition;
  splitPreviewTransition: SurfaceTransition;
  guardEditorAction: (fn: () => void) => void;
  registerEditorSession: (session: EditorSessionRegistration | null) => void;
  requestEditorClose: () => void;
  displayedLeafNodesRef: MutableRefObject<TokenNode[]>;
  tokenListCompareRef: MutableRefObject<TokenListImperativeHandle | null>;
  handleEditorNavigate: (direction: 1 | -1) => void;
  handleEditorSave: (savedPath: string) => void;
  handleEditorSaveAndCreateAnother: (
    savedPath: string,
    savedType: string,
  ) => void;
  handlePreviewEdit: () => void;
  handlePreviewClose: () => void;
  splitRatio: number;
  splitValueNow: number;
  splitContainerRef: RefObject<HTMLDivElement>;
  handleSplitDragStart: (event: React.MouseEvent) => void;
  handleSplitKeyDown: (event: React.KeyboardEvent) => void;
  availableFonts: string[];
  fontWeightsByFamily: Record<string, number[]>;
}

export interface EditorSessionRegistration {
  isDirty: boolean;
  canSave: boolean;
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
  closeWhenClean: () => void;
}

export interface TokensWorkspaceController {
  showIssuesOnly: boolean;
  setShowIssuesOnly: Dispatch<SetStateAction<boolean>>;
  lintViolations: LintViolation[];
  jumpToNextIssue: () => void;
  cascadeDiff: Record<string, { before: unknown; after: unknown }> | null;
  refreshAll: () => void;
  pushUndo: (slot: UndoSlot) => void;
  setErrorToast: (message: string) => void;
  setSuccessToast: (message: string) => void;
  handleNavigateToSet: (setName: string, tokenPath: string) => void;
  handleNavigateToRecipe: (recipeId: string) => void;
  flowPanelInitialPath: string | null;
  setFlowPanelInitialPath: (path: string | null) => void;
  tokenListCompareRef: MutableRefObject<TokenListImperativeHandle | null>;
  tokenListSelection: string[];
  onTokenDragStart: (paths: string[], fromSet: string) => void;
  onTokenDragEnd: () => void;
  recentlyTouched: RecentlyTouchedState;
  starredTokens: StarredTokensState;
  handleOpenCrossCollectionCompare: (path: string) => void;
  handlePaletteDuplicate: (path: string) => Promise<void>;
  handlePaletteRename: (path: string) => void;
  handlePaletteMove: (path: string) => void;
  requestPaletteDelete: (paths: string[], label: string) => void;
  handlePaletteDeleteToken: (path: string) => void;
}

export interface CollectionWorkspaceController {
  collectionManagerHandleRef: MutableRefObject<CollectionManagerHandle | null>;
}

export interface ApplyWorkspaceController {
  triggerCreateToken: number;
}

export interface SyncWorkspaceController {
  validationIssues: ValidationIssue[] | null;
  validationSummary: ValidationSummary | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
  recentOperations: OperationEntry[];
  totalOperations: number;
  hasMoreOperations: boolean;
  loadMoreOperations: () => void;
  handleRollback: (id: string) => void;
  redoableItems: Array<{ origOpId: string; description: string }>;
  handleServerRedo: (id?: string) => void;
  undoDescriptions: string[];
  redoableOpIds: Set<string>;
  executeUndo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  redoSlot: UndoSlot | null;
  executeRedo: () => void;
  setSyncGroupPending: (
    value: { groupPath: string; tokenCount: number } | null,
  ) => void;
  setSyncGroupStylesPending: (
    value: { groupPath: string; tokenCount: number } | null,
  ) => void;
  setGroupScopesPath: (path: string | null) => void;
  setGroupScopesSelected: Dispatch<SetStateAction<string[]>>;
  setGroupScopesError: (error: string | null) => void;
  tokenChangeKey: number;
  publishPanelHandleRef: MutableRefObject<PublishPanelHandle | null>;
}

export interface SetManagerWorkspaceController {
  onOpenQuickSwitch: () => void;
  onRename: (setName: string) => void;
  onDuplicate: (setName: string) => void;
  onDelete: (setName: string) => void;
  onReorder: (setName: string, direction: "left" | "right") => void;
  onReorderFull: (newOrder: string[]) => void;
  onOpenCreateSet: () => void;
  onEditInfo: (setName: string) => void;
  onMerge?: (setName: string) => void;
  onSplit: (setName: string) => void;
  onBulkDelete: (sets: string[]) => Promise<void>;
  onBulkDuplicate: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder: (
    moves: Array<{ from: string; to: string }>,
  ) => Promise<void>;
  renamingSet: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  renameError: string;
  setRenameError: (value: string) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  editingMetadataSet: string | null;
  metadataDescription: string;
  setMetadataDescription: (value: string) => void;
  onMetadataClose: () => void;
  onMetadataSave: () => void;
  deletingSet: string | null;
  onDeleteConfirm: () => void | Promise<void>;
  onDeleteCancel: () => void;
  mergingSet: string | null;
  mergeTargetSet: string;
  mergeConflicts: Array<{
    path: string;
    sourceValue: unknown;
    targetValue: unknown;
  }>;
  mergeResolutions: Record<string, "source" | "target">;
  mergeChecked: boolean;
  mergeLoading: boolean;
  onMergeTargetChange: (target: string) => void;
  setMergeResolutions: (
    updater:
      | Record<string, "source" | "target">
      | ((
          prev: Record<string, "source" | "target">,
        ) => Record<string, "source" | "target">),
  ) => void;
  onMergeCheckConflicts: () => void | Promise<void>;
  onMergeConfirm: () => void | Promise<void>;
  onMergeClose: () => void;
  splittingSet: string | null;
  splitPreview: Array<{ key: string; newName: string; count: number }>;
  splitDeleteOriginal: boolean;
  splitLoading: boolean;
  setSplitDeleteOriginal: (value: boolean) => void;
  onSplitConfirm: () => void | Promise<void>;
  onSplitClose: () => void;
}

export interface WorkspaceControllerValue {
  shell: ShellWorkspaceController;
  editor: EditorShellController;
  tokens: TokensWorkspaceController;
  themes: CollectionWorkspaceController;
  apply: ApplyWorkspaceController;
  sync: SyncWorkspaceController;
  setManager: SetManagerWorkspaceController;
}

const WorkspaceControllerContext =
  createContext<WorkspaceControllerValue | null>(null);

export function WorkspaceControllerProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WorkspaceControllerValue;
}) {
  return (
    <WorkspaceControllerContext.Provider value={value}>
      {children}
    </WorkspaceControllerContext.Provider>
  );
}

function useWorkspaceControllerContext(): WorkspaceControllerValue {
  const value = useContext(WorkspaceControllerContext);
  if (!value) {
    throw new Error(
      "useWorkspaceControllerContext must be used inside WorkspaceControllerProvider",
    );
  }
  return value;
}

export function useShellWorkspaceController(): ShellWorkspaceController {
  return useWorkspaceControllerContext().shell;
}

export function useEditorShellController(): EditorShellController {
  return useWorkspaceControllerContext().editor;
}

export function useTokensWorkspaceController(): TokensWorkspaceController {
  return useWorkspaceControllerContext().tokens;
}

export function useCollectionWorkspaceController(): CollectionWorkspaceController {
  return useWorkspaceControllerContext().themes;
}

export function useApplyWorkspaceController(): ApplyWorkspaceController {
  return useWorkspaceControllerContext().apply;
}

export function useSyncWorkspaceController(): SyncWorkspaceController {
  return useWorkspaceControllerContext().sync;
}

export function useSetManagerWorkspaceController(): SetManagerWorkspaceController {
  return useWorkspaceControllerContext().setManager;
}
