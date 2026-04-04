import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { TokenListModalsProps } from './TokenListModals';

export type TokenListModalsState = TokenListModalsProps;

const TokenListModalsContext = createContext<TokenListModalsState | null>(null);

export function TokenListModalsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: TokenListModalsState;
}) {
  return (
    <TokenListModalsContext.Provider value={value}>
      {children}
    </TokenListModalsContext.Provider>
  );
}

export function useTokenListModals(): TokenListModalsState {
  const ctx = useContext(TokenListModalsContext);
  if (!ctx) throw new Error('useTokenListModals must be used within TokenListModalsProvider');
  return ctx;
}

