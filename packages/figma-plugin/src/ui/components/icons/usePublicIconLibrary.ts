import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  PUBLIC_ICON_LIMITS,
  PUBLIC_ICON_PROVIDER_ID,
  type PublicIconCollection,
  type PublicIconCollectionListResponse,
  type PublicIconProvider,
  type PublicIconProvidersResponse,
  type PublicIconResultsResponse,
} from "@token-workshop/core";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { getErrorMessage, isAbortError } from "../../shared/utils";
import {
  isPublicIconCollectionBrowseResponse,
  mergePublicCollectionResults,
  mergePublicIconResults,
  normalizePublicCollectionId,
  PUBLIC_ICON_SOURCES,
  publicCollectionIdError,
  publicCollectionNextStart,
  publicIconNextStart,
  publicIconPageLimit,
  type PublicIconSourceId,
} from "./publicIconImportUtils";

interface UsePublicIconLibraryArgs {
  serverUrl: string;
  enabled: boolean;
  busy: boolean;
}

const PUBLIC_ICON_PROVIDER_TIMEOUT_MS = 10_000;
const PUBLIC_ICON_REQUEST_TIMEOUT_MS = 15_000;

interface PublicIconRequestState {
  requestVersionRef: MutableRefObject<number>;
  activeRequestIdRef: MutableRefObject<number>;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

interface PublicIconRequestRun {
  version: number;
  id: number;
  abortController: AbortController;
}

function usePublicIconRequestState(): PublicIconRequestState {
  const requestVersionRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  return useMemo(
    () => ({
      requestVersionRef,
      activeRequestIdRef,
      abortControllerRef,
    }),
    [],
  );
}

function abortPublicIconRequest(request: PublicIconRequestState): void {
  request.requestVersionRef.current += 1;
  request.abortControllerRef.current?.abort();
}

function startPublicIconRequest(
  request: PublicIconRequestState,
  restart: boolean,
): PublicIconRequestRun {
  if (restart) {
    request.requestVersionRef.current += 1;
  }

  const id = request.activeRequestIdRef.current + 1;
  const abortController = new AbortController();
  request.activeRequestIdRef.current = id;
  request.abortControllerRef.current?.abort();
  request.abortControllerRef.current = abortController;

  return {
    version: request.requestVersionRef.current,
    id,
    abortController,
  };
}

function publicIconRequestIsCurrent(
  request: PublicIconRequestState,
  run: PublicIconRequestRun,
): boolean {
  return (
    run.version === request.requestVersionRef.current &&
    run.id === request.activeRequestIdRef.current
  );
}

function finishPublicIconRequest(
  request: PublicIconRequestState,
  run: PublicIconRequestRun,
  onCurrentRequestFinished: () => void,
): void {
  if (run.id !== request.activeRequestIdRef.current) {
    return;
  }

  onCurrentRequestFinished();
  if (request.abortControllerRef.current === run.abortController) {
    request.abortControllerRef.current = null;
  }
}

export function usePublicIconLibrary({
  serverUrl,
  enabled,
  busy,
}: UsePublicIconLibraryArgs) {
  const libraryRequest = usePublicIconRequestState();
  const catalogRequest = usePublicIconRequestState();

  const [selectedSourceId, setSelectedSourceId] =
    useState<PublicIconSourceId>("lucide");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("lucide");
  const [category, setCategory] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResults, setCatalogResults] =
    useState<PublicIconCollectionListResponse | null>(null);
  const [providers, setProviders] = useState<PublicIconProvider[]>([]);
  const [providerError, setProviderError] = useState("");
  const [results, setResults] = useState<PublicIconResultsResponse | null>(null);
  const [selectedIconIds, setSelectedIconIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const customCollectionError = publicCollectionIdError(collection);
  const canBrowseCustomCollection = customCollectionError === null;

  const selectedSource = useMemo(
    () => PUBLIC_ICON_SOURCES.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId],
  );

  const activeProvider =
    providers.find((provider) => provider.id === PUBLIC_ICON_PROVIDER_ID) ??
    results?.provider ??
    catalogResults?.provider ??
    null;

  const currentCollection = isPublicIconCollectionBrowseResponse(results)
    ? results.collection
    : (results?.icons[0]?.collection ?? null);

  const selectedIcons = useMemo(
    () => (results?.icons ?? []).filter((icon) => selectedIconIds.has(icon.id)),
    [results, selectedIconIds],
  );

  const selectedIconCount = selectedIcons.length;
  const selectionLimitReached = selectedIconCount >= PUBLIC_ICON_LIMITS.importMax;

  const categories = isPublicIconCollectionBrowseResponse(results)
    ? results.categories
    : [];

  const resultsQuery = results
    ? isPublicIconCollectionBrowseResponse(results)
      ? ""
      : results.query
    : "";
  const resultsCategory = isPublicIconCollectionBrowseResponse(results)
    ? (results.category ?? "")
    : "";
  const browsingCollection = isPublicIconCollectionBrowseResponse(results);

  const canLoadMoreIcons = Boolean(
    results &&
      publicIconNextStart(results) < results.total &&
      query.trim() === resultsQuery &&
      currentCollection?.id === normalizePublicCollectionId(collection) &&
      (!browsingCollection || category === resultsCategory),
  );

  const canLoadMoreCatalog = Boolean(
    catalogResults &&
      publicCollectionNextStart(catalogResults) < catalogResults.total &&
      catalogQuery.trim() === catalogResults.query,
  );

  const abortLibraryRequest = useCallback(() => {
    abortPublicIconRequest(libraryRequest);
  }, [libraryRequest]);

  const abortCatalogRequest = useCallback(() => {
    abortPublicIconRequest(catalogRequest);
  }, [catalogRequest]);

  useEffect(() => {
    return () => {
      abortPublicIconRequest(libraryRequest);
      abortPublicIconRequest(catalogRequest);
    };
  }, [catalogRequest, libraryRequest]);

  useEffect(() => {
    abortPublicIconRequest(libraryRequest);
    abortPublicIconRequest(catalogRequest);
    setCatalogLoading(false);
    setLoading(false);
    setLoadedOnce(false);
    setProviders([]);
    setProviderError("");
    setResults(null);
    setCatalogResults(null);
    setSelectedIconIds(new Set());
    setError("");
  }, [catalogRequest, libraryRequest, serverUrl]);

  useEffect(() => {
    if (!results) {
      setSelectedIconIds((current) =>
        current.size > 0 ? new Set() : current,
      );
      return;
    }

    const resultIconIds = new Set(results.icons.map((icon) => icon.id));
    setSelectedIconIds((current) => {
      const next = new Set(
        Array.from(current).filter((iconId) => resultIconIds.has(iconId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [results]);

  useEffect(() => {
    if (enabled && !busy) {
      return;
    }
    abortLibraryRequest();
    abortCatalogRequest();
    setLoading(false);
    setCatalogLoading(false);
    if (!results) {
      setLoadedOnce(false);
    }
  }, [abortCatalogRequest, abortLibraryRequest, busy, enabled, results]);

  useEffect(() => {
    if (!enabled || providers.length > 0) {
      return;
    }

    const controller = new AbortController();
    void apiFetch<PublicIconProvidersResponse>(
      `${serverUrl}/api/icons/public/providers`,
      {
        signal: createFetchSignal(
          controller.signal,
          PUBLIC_ICON_PROVIDER_TIMEOUT_MS,
        ),
      },
    )
      .then((response) => {
        setProviders(response.providers);
        setProviderError("");
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setProviderError(
            getErrorMessage(err, "Failed to load public icon sources."),
          );
        }
      });

    return () => controller.abort();
  }, [enabled, providers.length, serverUrl]);

  const loadCollection = useCallback(async (next?: {
    query?: string;
    collection?: string;
    category?: string;
    start?: number;
    append?: boolean;
  }) => {
    const nextQuery = (next?.query ?? query).trim();
    const nextCollection = normalizePublicCollectionId(
      next?.collection ?? collection,
    );
    const nextCategory = next?.category ?? category;
    const start = next?.start ?? 0;
    const append = next?.append ?? false;

    if (busy || (append && loading)) {
      return;
    }
    const collectionError = publicCollectionIdError(nextCollection);
    if (collectionError) {
      setError(collectionError);
      return;
    }
    const requestRun = startPublicIconRequest(libraryRequest, !append);

    setLoadedOnce(true);
    setLoading(true);
    setError("");
    if (!append) {
      setResults(null);
      setSelectedIconIds(new Set());
    }

    try {
      const params = new URLSearchParams({
        provider: activeProvider?.id ?? PUBLIC_ICON_PROVIDER_ID,
        limit: String(publicIconPageLimit(nextQuery)),
        start: String(start),
      });
      if (nextQuery) {
        params.set("query", nextQuery);
        params.set("collection", nextCollection);
      } else {
        params.set("collection", nextCollection);
        if (nextCategory) {
          params.set("category", nextCategory);
        }
      }
      const path = nextQuery
        ? "/api/icons/public/search"
        : "/api/icons/public/collection";
      const result = await apiFetch<PublicIconResultsResponse>(
        `${serverUrl}${path}?${params.toString()}`,
        {
          signal: createFetchSignal(
            requestRun.abortController.signal,
            PUBLIC_ICON_REQUEST_TIMEOUT_MS,
          ),
        },
      );
      if (!publicIconRequestIsCurrent(libraryRequest, requestRun)) {
        return;
      }
      setResults((current) =>
        append ? mergePublicIconResults(current, result) : result,
      );
      if (result.icons.length === 0) {
        setError(
          nextQuery
            ? "No public icons matched this search."
            : "No public icons were found in this collection.",
        );
      }
    } catch (err) {
      if (
        isAbortError(err) ||
        !publicIconRequestIsCurrent(libraryRequest, requestRun)
      ) {
        return;
      }
      setError(getErrorMessage(err, "Failed to load public icons."));
    } finally {
      finishPublicIconRequest(libraryRequest, requestRun, () => {
        setLoading(false);
      });
    }
  }, [
    activeProvider?.id,
    busy,
    category,
    collection,
    libraryRequest,
    loading,
    query,
    serverUrl,
  ]);

  const loadCatalog = useCallback(async (next?: {
    query?: string;
    start?: number;
    append?: boolean;
  }) => {
    const nextQuery = (next?.query ?? catalogQuery).trim();
    const start = next?.start ?? 0;
    const append = next?.append ?? false;
    if (busy || (append && catalogLoading)) {
      return;
    }
    const requestRun = startPublicIconRequest(catalogRequest, !append);

    setCatalogLoading(true);
    setError("");
    if (!append) {
      setCatalogResults(null);
    }

    try {
      const params = new URLSearchParams({
        provider: activeProvider?.id ?? PUBLIC_ICON_PROVIDER_ID,
        limit: String(PUBLIC_ICON_LIMITS.collectionListPage),
        start: String(start),
      });
      if (nextQuery) {
        params.set("query", nextQuery);
      }
      const result = await apiFetch<PublicIconCollectionListResponse>(
        `${serverUrl}/api/icons/public/collections?${params.toString()}`,
        {
          signal: createFetchSignal(
            requestRun.abortController.signal,
            PUBLIC_ICON_REQUEST_TIMEOUT_MS,
          ),
        },
      );
      if (!publicIconRequestIsCurrent(catalogRequest, requestRun)) {
        return;
      }
      setCatalogResults((current) =>
        append ? mergePublicCollectionResults(current, result) : result,
      );
      if (result.collections.length === 0) {
        setError("No public icon libraries matched this search.");
      }
    } catch (err) {
      if (
        isAbortError(err) ||
        !publicIconRequestIsCurrent(catalogRequest, requestRun)
      ) {
        return;
      }
      setError(getErrorMessage(err, "Failed to load public icon libraries."));
    } finally {
      finishPublicIconRequest(catalogRequest, requestRun, () => {
        setCatalogLoading(false);
      });
    }
  }, [
    activeProvider?.id,
    busy,
    catalogLoading,
    catalogQuery,
    catalogRequest,
    serverUrl,
  ]);

  useEffect(() => {
    if (!enabled || loadedOnce || loading || selectedSourceId !== "lucide") {
      return;
    }
    void loadCollection({ collection: "lucide", query: "", category: "" });
  }, [enabled, loadedOnce, loading, loadCollection, selectedSourceId]);

  const updateQuery = useCallback((value: string) => {
    const wasSearching = Boolean(query.trim());
    abortLibraryRequest();
    setQuery(value);
    setError("");
    if (wasSearching && !value.trim()) {
      void loadCollection({ query: "", category });
    }
  }, [abortLibraryRequest, category, loadCollection, query]);

  const clearQuery = useCallback(() => {
    abortLibraryRequest();
    setQuery("");
    void loadCollection({ query: "", category });
  }, [abortLibraryRequest, category, loadCollection]);

  const updateCollectionDraft = useCallback((value: string) => {
    abortLibraryRequest();
    setSelectedSourceId("custom");
    setCollection(value);
    setCategory("");
    setQuery("");
    setResults(null);
    setSelectedIconIds(new Set());
    setError("");
  }, [abortLibraryRequest]);

  const updateCatalogQuery = useCallback((value: string) => {
    abortCatalogRequest();
    setCatalogQuery(value);
    setError("");
  }, [abortCatalogRequest]);

  const selectSource = useCallback((source: (typeof PUBLIC_ICON_SOURCES)[number]) => {
    setSelectedSourceId(source.id);
    setCollection(source.collection);
    setQuery("");
    setCategory("");
    setError("");
    void loadCollection({
      query: "",
      collection: source.collection,
      category: "",
    });
  }, [loadCollection]);

  const openCatalog = useCallback(() => {
    abortLibraryRequest();
    setSelectedSourceId("all");
    setQuery("");
    setCategory("");
    setResults(null);
    setSelectedIconIds(new Set());
    setError("");
    if (!catalogResults) {
      void loadCatalog({ query: "" });
    }
  }, [abortLibraryRequest, catalogResults, loadCatalog]);

  const selectCustomSource = useCallback(() => {
    abortLibraryRequest();
    setSelectedSourceId("custom");
    setQuery("");
    setCategory("");
    setResults(null);
    setSelectedIconIds(new Set());
    setError("");
  }, [abortLibraryRequest]);

  const selectCatalogCollection = useCallback((nextCollection: PublicIconCollection) => {
    setSelectedSourceId("all");
    setCollection(nextCollection.id);
    setQuery("");
    setCategory("");
    setError("");
    void loadCollection({
      query: "",
      collection: nextCollection.id,
      category: "",
    });
  }, [loadCollection]);

  const selectCategory = useCallback((nextCategory: string) => {
    setCategory(nextCategory);
    setQuery("");
    void loadCollection({ query: "", category: nextCategory });
  }, [loadCollection]);

  const browseCustomCollection = useCallback(() => {
    const nextCollection = normalizePublicCollectionId(collection);
    const collectionError = publicCollectionIdError(nextCollection);
    if (collectionError) {
      setError(collectionError);
      return;
    }
    setSelectedSourceId("custom");
    setCollection(nextCollection);
    setCategory("");
    setQuery("");
    void loadCollection({
      query: "",
      collection: nextCollection,
      category: "",
    });
  }, [collection, loadCollection]);

  const searchIcons = useCallback(() => {
    const nextQuery = query.trim();
    setCategory("");
    void loadCollection({ query: nextQuery, category: "" });
  }, [loadCollection, query]);

  const searchCatalog = useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadMoreIcons = useCallback(() => {
    if (!results) {
      return;
    }
    void loadCollection({
      query,
      collection,
      category,
      start: publicIconNextStart(results),
      append: true,
    });
  }, [category, collection, loadCollection, query, results]);

  const loadMoreCatalog = useCallback(() => {
    if (!catalogResults) {
      return;
    }
    void loadCatalog({
      query: catalogQuery,
      start: publicCollectionNextStart(catalogResults),
      append: true,
    });
  }, [catalogQuery, catalogResults, loadCatalog]);

  const clearSelection = useCallback(() => {
    setSelectedIconIds(new Set());
  }, []);

  const toggleIcon = useCallback((iconId: string) => {
    if (
      !selectedIconIds.has(iconId) &&
      selectedIconIds.size >= PUBLIC_ICON_LIMITS.importMax
    ) {
      setError(
        `Import up to ${PUBLIC_ICON_LIMITS.importMax} public icons at a time.`,
      );
      return;
    }

    setSelectedIconIds((current) => {
      const next = new Set(current);
      if (next.has(iconId)) {
        next.delete(iconId);
      } else {
        if (next.size >= PUBLIC_ICON_LIMITS.importMax) {
          return current;
        }
        next.add(iconId);
      }
      return next;
    });
    setError("");
  }, [selectedIconIds]);

  return {
    activeProvider,
    browseCustomCollection,
    canLoadMoreCatalog,
    canLoadMoreIcons,
    canBrowseCustomCollection,
    catalogLoading,
    catalogQuery,
    catalogResults,
    categories,
    category,
    clearQuery,
    clearSelection,
    collection,
    currentCollection,
    error,
    loading,
    loadMoreCatalog,
    loadMoreIcons,
    openCatalog,
    providerError,
    query,
    results,
    searchCatalog,
    searchIcons,
    selectedIconCount,
    selectedIconIds,
    selectedIcons,
    selectedSource,
    selectedSourceId,
    customCollectionError,
    selectCatalogCollection,
    selectCategory,
    selectCustomSource,
    selectionLimitReached,
    selectSource,
    updateCatalogQuery,
    updateCollectionDraft,
    updateQuery,
    toggleIcon,
  };
}
