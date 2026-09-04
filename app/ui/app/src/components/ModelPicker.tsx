import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  type JSX,
  useImperativeHandle,
} from "react";
import { Model } from "@/gotypes";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { useQueryClient } from "@tanstack/react-query";
import { getModelUpstreamInfo } from "@/api";
import { Chip, ListItem, SearchField } from "@/components/md3";
import { Icon } from "@/components/md3/Icon";

const stalenessCheckCache = new Map<string, number>();

export const ModelPicker = forwardRef<
  HTMLButtonElement,
  {
    chatId?: string;
    onModelSelect?: () => void;
    onEscape?: () => void;
    onDropdownToggle?: (isOpen: boolean) => void;
    isDisabled?: boolean;
  }
>(function ModelPicker(
  { chatId, onModelSelect, onEscape, onDropdownToggle, isDisabled },
  ref,
): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { selectedModel, setSettings, models, loading } = useSelectedModel(
    chatId,
    searchQuery,
  );
  const { cloudDisabled } = useCloudStatus();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const modelListRef = useRef<{
    scrollToSelectedModel: () => void;
    scrollToTop: () => void;
  }>(null);

  const checkModelStaleness = async (model: Model) => {
    if (
      !model ||
      !model.model ||
      model.digest === undefined ||
      model.digest === ""
    )
      return;

    // Check cache - only check staleness every 5 minutes per model
    const now = Date.now();
    const lastChecked = stalenessCheckCache.get(model.model);
    if (lastChecked && now - lastChecked < 5 * 60 * 1000) return;
    stalenessCheckCache.set(model.model, now);

    try {
      const upstreamInfo = await getModelUpstreamInfo(model);

      if (upstreamInfo.stale) {
        const currentStaleModels =
          queryClient.getQueryData<Map<string, boolean>>(["staleModels"]) ||
          new Map();
        const newMap = new Map(currentStaleModels);
        newMap.set(model.model, true);
        queryClient.setQueryData(["staleModels"], newMap);
      }
    } catch (error) {
      console.error("Failed to check model staleness:", error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (ref && typeof ref === "object" && ref.current) {
      (ref.current as any).closeDropdown = () => setIsOpen(false);
    }
  }, [ref, setIsOpen]);

  // Focus search when opened and refresh models
  // Clear search when closed
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      modelListRef.current?.scrollToSelectedModel();
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // When searching, scroll to top of list
  useEffect(() => {
    if (searchQuery && modelListRef.current) {
      modelListRef.current.scrollToTop();
    }
  }, [searchQuery]);

  useEffect(() => {
    if (selectedModel && !loading) {
      checkModelStaleness(selectedModel);
    }
  }, [selectedModel?.model, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        onEscape?.();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onEscape]);

  const handleModelSelect = (model: Model) => {
    setSettings({ SelectedModel: model.model });
    setIsOpen(false);
    onModelSelect?.();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Chip
        ref={ref}
        selected
        trailingIcon="arrow_drop_down"
        title="Select model"
        onClick={() => {
          const newState = !isOpen;
          setIsOpen(newState);
          onDropdownToggle?.(newState);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const newState = !isOpen;
            setIsOpen(newState);
            onDropdownToggle?.(newState);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="cursor-pointer"
        // The chip opens a dropdown rather than toggling a filter, so its
        // default aria-pressed is cleared instead of announcing a toggle
        // state the original raw button never exposed.
        aria-pressed={undefined}
      >
        {isDisabled ? "Loading..." : selectedModel?.model || "Select a model"}
      </Chip>
      {isOpen && (
        <div className="absolute right-0 text-[15px] bottom-full mb-2 z-50 w-64 rounded-2xl overflow-hidden bg-white border border-neutral-100 text-neutral-800 shadow-xl shadow-black/5 backdrop-blur-lg dark:border-neutral-600/40 dark:bg-neutral-800 dark:text-white dark:ring-black/20">
          <div className="px-1 py-2 border-b border-neutral-100 dark:border-neutral-700">
            {/* Was a raw <input> with hardcoded neutral-200/600 borders. It
                stayed raw only because SearchField could not take a ref, and
                this ref is what focuses the field when the dropdown opens --
                converting without it would have silently killed the autofocus.
                SearchField also brings the `.*` builder affordance every
                search surface in this app is required to carry. */}
            <SearchField
              inputRef={searchInputRef}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Find model..."
              label="Find model"
            />
          </div>

          <ModelList
            ref={modelListRef}
            models={models}
            selectedModel={selectedModel}
            onModelSelect={handleModelSelect}
            cloudDisabled={cloudDisabled}
            isOpen={isOpen}
          />
        </div>
      )}
    </div>
  );
});

export const ModelList = forwardRef(function ModelList(
  {
    models,
    selectedModel,
    onModelSelect,
    cloudDisabled,
    isOpen,
  }: {
    models: Model[];
    selectedModel: Model | null;
    onModelSelect: (model: Model) => void;
    cloudDisabled: boolean;
    isOpen: boolean;
  },
  ref,
): JSX.Element {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useImperativeHandle(ref, () => ({
    scrollToSelectedModel: () => {
      if (!selectedModel || !scrollContainerRef.current) return;
      const selectedIndex = models.findIndex(
        (m) => m.model === selectedModel.model,
      );
      if (selectedIndex !== -1) scrollToItem(selectedIndex);
    },
    scrollToTop: () => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    },
  }));

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || models.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev < models.length - 1 ? prev + 1 : 0;
            scrollToItem(next);
            return next;
          });
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : models.length - 1;
            scrollToItem(next);
            return next;
          });
          break;
        case "Enter":
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < models.length) {
            onModelSelect(models[highlightedIndex]);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, models, highlightedIndex, onModelSelect]);

  // Scroll active item into view
  const scrollToItem = (index: number) => {
    if (scrollContainerRef.current && index >= 0) {
      const container = scrollContainerRef.current;
      const item = container.children[index] as HTMLElement;
      if (item) {
        // Calculate the exact scroll position to center the item
        const containerHeight = container.clientHeight;
        const itemTop = item.offsetTop;
        const itemHeight = item.clientHeight;
        // Position the item in the center of the container
        container.scrollTop = itemTop - containerHeight / 2 + itemHeight / 2;
      }
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      className="h-64 overflow-y-auto overflow-x-hidden"
    >
      {models.length === 0 ? (
        <div className="px-3 py-2 text-neutral-500 dark:text-neutral-400">
          No models found
        </div>
      ) : (
        models.map((model, index) => {
          return (
            <div key={`${model.model}-${model.digest || "no-digest"}-${index}`}>
              {/* Was a raw <button> with hardcoded neutral-100/700 hover
                  states and its own inline cloud SVG. It stayed raw because
                  ListItem carried neither onMouseEnter (which drives the
                  highlighted index) nor a ref for the arrow-key scroll
                  helper's geometry -- converting without both would have
                  broken keyboard navigation invisibly. */}
              <ListItem
                shape="rounded"
                selected={
                  highlightedIndex === index ||
                  selectedModel?.model === model.model
                }
                onClick={() => onModelSelect(model)}
                onMouseEnter={() => setHighlightedIndex(index)}
                title={
                  <span className="block truncate">{model.model}</span>
                }
                trailing={
                  <>
                    {model.isCloud() && (
                      <Icon
                        name="cloud"
                        size={15}
                        className="text-on-surface-variant"
                      />
                    )}
                    {model.digest === undefined &&
                      (cloudDisabled || !model.isCloud()) && (
                        <Icon
                          name="download"
                          size={16}
                          className="text-on-surface-variant"
                        />
                      )}
                  </>
                }
              />
            </div>
          );
        })
      )}
    </div>
  );
});
