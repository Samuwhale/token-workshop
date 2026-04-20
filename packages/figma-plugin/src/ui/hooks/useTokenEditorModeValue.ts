import { useCallback, useMemo } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import type { TokenEditorModeValues, TokenEditorValue } from "../shared/tokenEditorTypes";

export interface ModeValueEntry {
  name: string;
  value: TokenEditorValue;
  setValue: (v: TokenEditorValue) => void;
}

export interface UseTokenEditorModeValueParams {
  collectionId: string;
  collections: TokenCollection[];
  value: TokenEditorValue;
  setValue: (v: TokenEditorValue) => void;
  modeValues: TokenEditorModeValues;
  setModeValues: (v: TokenEditorModeValues) => void;
}

export function useTokenEditorModeValue({
  collectionId,
  collections,
  value,
  setValue,
  modeValues,
  setModeValues,
}: UseTokenEditorModeValueParams) {
  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId],
  );

  const setModeValue = useCallback(
    (modeName: string, newValue: TokenEditorValue) => {
      if (!collection) return;
      if (collection.modes[0]?.name === modeName) {
        setValue(newValue);
      } else {
        setModeValues({
          ...modeValues,
          [collectionId]: {
            ...(modeValues[collectionId] ?? {}),
            [modeName]: newValue,
          },
        });
      }
    },
    [collection, collectionId, modeValues, setModeValues, setValue],
  );

  const modes: ModeValueEntry[] = useMemo(() => {
    if (!collection || collection.modes.length === 0) return [];

    return collection.modes.map((mode, index) => ({
      name: mode.name,
      value: index === 0
        ? value
        : (modeValues[collectionId]?.[mode.name] ?? ""),
      setValue: (v: TokenEditorValue) => setModeValue(mode.name, v),
    }));
  }, [collection, collectionId, value, modeValues, setModeValue]);

  return { modes };
}
