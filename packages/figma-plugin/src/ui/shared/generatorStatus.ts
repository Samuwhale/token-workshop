import type {
  TokenGeneratorDocument,
  TokenGeneratorPreviewResult,
} from "@token-workshop/core";
import { apiFetch } from "./apiFetch";

export interface GeneratorStatusGenerator {
  id: string;
  name: string;
  targetCollectionId: string;
}

export interface GeneratorStatusItem<
  TGenerator extends GeneratorStatusGenerator = GeneratorStatusGenerator,
> {
  generator: TGenerator;
  preview: TokenGeneratorPreviewResult;
  stale: boolean;
  unapplied: boolean;
  blocking: boolean;
  managedTokenCount: number;
}

export type FullGeneratorStatusItem = GeneratorStatusItem<TokenGeneratorDocument>;

interface GeneratorStatusResponse<
  TGenerator extends GeneratorStatusGenerator = GeneratorStatusGenerator,
> {
  generators: Array<GeneratorStatusItem<TGenerator>>;
}

export async function fetchGeneratorStatuses<
  TGenerator extends GeneratorStatusGenerator = GeneratorStatusGenerator,
>(
  serverUrl: string,
  options?: RequestInit,
): Promise<Array<GeneratorStatusItem<TGenerator>>> {
  const data = await apiFetch<GeneratorStatusResponse<TGenerator>>(
    `${serverUrl}/api/generators/status`,
    options,
  );
  return data.generators;
}

export function generatorStatusHasReviewIssue(
  status: GeneratorStatusItem,
): boolean {
  return (
    status.blocking ||
    status.stale ||
    status.unapplied ||
    status.preview.diagnostics.length > 0 ||
    status.preview.outputs.some((output) => output.collision)
  );
}
