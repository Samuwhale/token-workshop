import { createContext, useContext } from 'react';
import type { TokenTreeContextType } from './tokenListTypes';

const TokenTreeContext = createContext<TokenTreeContextType | null>(null);

export const TokenTreeProvider = TokenTreeContext.Provider;

export function useTokenTree(): TokenTreeContextType {
  const ctx = useContext(TokenTreeContext);
  if (!ctx) throw new Error('useTokenTree must be used within a TokenTreeProvider');
  return ctx;
}
