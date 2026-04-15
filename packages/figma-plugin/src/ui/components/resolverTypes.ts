import type { TokenMapEntry } from "../../shared/types";
import type {
  ResolverMeta,
  ResolverModifierMeta,
  ResolverSelectionOrigin,
} from "../hooks/useResolvers";

export interface ResolverContentProps {
  connected: boolean;
  resolvers: ResolverMeta[];
  resolverLoadErrors?: Record<string, { message: string; at: string }>;
  activeResolver: string | null;
  selectionOrigin?: ResolverSelectionOrigin;
  setActiveResolver: (name: string | null) => void;
  resolverInput: Record<string, string>;
  setResolverInput: (input: Record<string, string>) => void;
  activeModifiers: Record<string, ResolverModifierMeta>;
  resolvedTokens: Record<string, TokenMapEntry> | null;
  resolverError: string | null;
  loading: boolean;
  resolversLoading?: boolean;
  fetchResolvers: () => void;
  convertFromThemes: (name?: string) => Promise<unknown>;
  deleteResolver: (name: string) => Promise<void>;
}
