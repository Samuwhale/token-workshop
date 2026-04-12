import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type {
  TokenTreeGroupActionsContextType,
  TokenTreeGroupStateContextType,
  TokenTreeLeafActionsContextType,
  TokenTreeLeafStateContextType,
  TokenTreeSharedDataContextType,
} from "./tokenListTypes";

function createRequiredContext<T>(displayName: string) {
  const Context = createContext<T | null>(null);
  Context.displayName = displayName;

  function useRequiredContext() {
    const value = useContext(Context);
    if (!value) {
      throw new Error(`${displayName} must be used within a TokenTreeProvider`);
    }
    return value;
  }

  return [Context.Provider, useRequiredContext] as const;
}

const [TokenTreeSharedDataProvider, useTokenTreeSharedData] =
  createRequiredContext<TokenTreeSharedDataContextType>(
    "TokenTreeSharedDataContext",
  );

const [TokenTreeGroupStateProvider, useTokenTreeGroupState] =
  createRequiredContext<TokenTreeGroupStateContextType>(
    "TokenTreeGroupStateContext",
  );

const [TokenTreeGroupActionsProvider, useTokenTreeGroupActions] =
  createRequiredContext<TokenTreeGroupActionsContextType>(
    "TokenTreeGroupActionsContext",
  );

const [TokenTreeLeafStateProvider, useTokenTreeLeafState] =
  createRequiredContext<TokenTreeLeafStateContextType>(
    "TokenTreeLeafStateContext",
  );

const [TokenTreeLeafActionsProvider, useTokenTreeLeafActions] =
  createRequiredContext<TokenTreeLeafActionsContextType>(
    "TokenTreeLeafActionsContext",
  );

export function TokenTreeProvider({
  sharedData,
  groupState,
  groupActions,
  leafState,
  leafActions,
  children,
}: {
  sharedData: TokenTreeSharedDataContextType;
  groupState: TokenTreeGroupStateContextType;
  groupActions: TokenTreeGroupActionsContextType;
  leafState: TokenTreeLeafStateContextType;
  leafActions: TokenTreeLeafActionsContextType;
  children: ReactNode;
}) {
  return (
    <TokenTreeSharedDataProvider value={sharedData}>
      <TokenTreeGroupStateProvider value={groupState}>
        <TokenTreeGroupActionsProvider value={groupActions}>
          <TokenTreeLeafStateProvider value={leafState}>
            <TokenTreeLeafActionsProvider value={leafActions}>
              {children}
            </TokenTreeLeafActionsProvider>
          </TokenTreeLeafStateProvider>
        </TokenTreeGroupActionsProvider>
      </TokenTreeGroupStateProvider>
    </TokenTreeSharedDataProvider>
  );
}

export {
  useTokenTreeGroupActions,
  useTokenTreeGroupState,
  useTokenTreeLeafActions,
  useTokenTreeLeafState,
  useTokenTreeSharedData,
};
