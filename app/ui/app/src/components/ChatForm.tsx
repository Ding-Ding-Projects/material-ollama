import { IconButton } from "@/components/md3";
import Logo from "@/components/Logo";
import { ModelPicker } from "@/components/ModelPicker";
import { WebSearchButton } from "@/components/WebSearchButton";
import { ImageThumbnail } from "@/components/ImageThumbnail";
import { isImageFile } from "@/utils/imageUtils";
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import {
  useSendMessage,
  useIsStreaming,
  useCancelMessage,
} from "@/hooks/useChats";
import { useNavigate } from "@tanstack/react-router";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import {
  useHasVisionCapability,
  useHasToolsCapability,
} from "@/hooks/useModelCapabilities";
import { useUser } from "@/hooks/useUser";
import { DisplayLogin } from "@/components/DisplayLogin";
import { ErrorEvent, Message } from "@/gotypes";
import { useSettings } from "@/hooks/useSettings";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { ThinkButton } from "./ThinkButton";
import { ErrorMessage } from "./ErrorMessage";
import { processFiles } from "@/utils/fileValidation";
import type { ImageData } from "@/types/webview";

export type ThinkingLevel = "low" | "medium" | "high";

interface FileAttachment {
  filename: string;
  data: Uint8Array;
  type?: string; // MIME type
}

interface MessageInput {
  content: string;
  attachments: Array<{
    id: string;
    filename: string;
    data?: Uint8Array; // undefined for existing files from editing
  }>;
  fileErrors: Array<{ filename: string; error: string }>;
}

interface ChatFormProps {
  hasMessages: boolean;
  onSubmit?: (
    message: string,
    options: {
      attachments?: FileAttachment[];
      index?: number;
      webSearch?: boolean;
      fileTools?: boolean;
      think?: boolean | string;
    },
  ) => void;
  autoFocus?: boolean;
  chatId?: string;
  isDownloadingModel?: boolean;
  isDisabled?: boolean;
  // Editing props - when provided, ChatForm enters edit mode
  editingMessage?: {
    content: string;
    index: number;
    originalMessage: Message;
  } | null;
  onCancelEdit?: () => void;
  onFilesReceived?: (
    callback: (
      files: Array<{ filename: string; data: Uint8Array; type?: string }>,
      errors: Array<{ filename: string; error: string }>,
    ) => void,
  ) => void;
}

function ChatForm({
  hasMessages,
  onSubmit,
  autoFocus = false,
  chatId = "new",
  isDownloadingModel = false,
  isDisabled = false,
  editingMessage,
  onCancelEdit,
  onFilesReceived,
}: ChatFormProps) {
  const [message, setMessage] = useState<MessageInput>({
    content: "",
    attachments: [],
    fileErrors: [],
  });
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const compositionEndTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thinkButtonRef = useRef<HTMLButtonElement>(null);
  const thinkingLevelButtonRef = useRef<HTMLButtonElement>(null);
  const webSearchButtonRef = useRef<HTMLButtonElement>(null);
  const modelPickerRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const { mutate: sendMessageMutation } = useSendMessage(chatId);
  const navigate = useNavigate();
  const isStreaming = useIsStreaming(chatId);
  const cancelMessage = useCancelMessage();
  const isDownloading = isDownloadingModel;
  const { selectedModel } = useSelectedModel();
  const hasVisionCapability = useHasVisionCapability(selectedModel?.model);
  const { isAuthenticated, isLoading: isLoadingUser } = useUser();
  const [loginPromptFeature, setLoginPromptFeature] = useState<
    "webSearch" | "turbo" | null
  >(null);
  const [fileUploadError, setFileUploadError] = useState<ErrorEvent | null>(
    null,
  );

  const handleThinkingLevelDropdownToggle = (isOpen: boolean) => {
    if (
      isOpen &&
      modelPickerRef.current &&
      (modelPickerRef.current as any).closeDropdown
    ) {
      (modelPickerRef.current as any).closeDropdown();
    }
  };

  const handleModelPickerDropdownToggle = (isOpen: boolean) => {
    if (
      isOpen &&
      thinkingLevelButtonRef.current &&
      (thinkingLevelButtonRef.current as any).closeDropdown
    ) {
      (thinkingLevelButtonRef.current as any).closeDropdown();
    }
  };

  const {
    settings: {
      webSearchEnabled,
      thinkEnabled,
      thinkLevel: settingsThinkLevel,
    },
    setSettings,
  } = useSettings();
  const { cloudDisabled } = useCloudStatus();

  const supportsWebSearch = useHasToolsCapability(selectedModel?.model);
  // Use per-chat thinking level instead of global
  const thinkLevel: ThinkingLevel =
    settingsThinkLevel === "none" || !settingsThinkLevel
      ? "medium"
      : (settingsThinkLevel as ThinkingLevel);
  const setThinkingLevel = (newLevel: ThinkingLevel) => {
    setSettings({ ThinkLevel: newLevel });
  };

  const modelSupportsThinkingLevels =
    selectedModel?.model.toLowerCase().startsWith("gpt-oss") || false;
  const supportsThinkToggling =
    selectedModel?.model.toLowerCase().startsWith("deepseek-v3.1") || false;

  useEffect(() => {
    if (supportsThinkToggling && thinkEnabled && webSearchEnabled) {
      setSettings({ WebSearchEnabled: false });
    }
  }, [
    selectedModel?.model,
    supportsThinkToggling,
    thinkEnabled,
    webSearchEnabled,
    setSettings,
  ]);

  useEffect(() => {
    if (cloudDisabled && webSearchEnabled) {
      setSettings({ WebSearchEnabled: false });
    }
  }, [cloudDisabled, webSearchEnabled, setSettings]);

  const removeFile = (index: number) => {
    setMessage((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const removeFileError = (index: number) => {
    setMessage((prev) => ({
      ...prev,
      fileErrors: prev.fileErrors.filter((_, i) => i !== index),
    }));
  };

  // Create stable callback for file handling
  const handleFilesReceived = useCallback(
    (
      files: Array<{ filename: string; data: Uint8Array; type?: string }>,
      errors: Array<{ filename: string; error: string }> = [],
    ) => {
      if (files.length > 0) {
        setFileUploadError(null);

        const newAttachments = files.map((file) => ({
          id: crypto.randomUUID(),
          filename: file.filename,
          data: file.data,
        }));

        setMessage((prev) => ({
          ...prev,
          attachments: [...prev.attachments, ...newAttachments],
        }));
      }

      // Add validation errors to form state
      if (errors.length > 0) {
        setMessage((prev) => ({
          ...prev,
          fileErrors: [...prev.fileErrors, ...errors],
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (onFilesReceived) {
      onFilesReceived(handleFilesReceived);
    }
  }, [onFilesReceived, handleFilesReceived]);

  // Determine if login banner should be shown
  const shouldShowLoginBanner =
    !cloudDisabled &&
    !isLoadingUser &&
    !isAuthenticated &&
    ((webSearchEnabled && supportsWebSearch) || selectedModel?.isCloud());

  // Determine which feature to highlight in the banner
  const getActiveFeatureForBanner = () => {
    if (cloudDisabled) return null;
    if (!isAuthenticated) {
      if (loginPromptFeature) return loginPromptFeature;
      if (webSearchEnabled && selectedModel?.isCloud()) return "webSearch";
      if (webSearchEnabled) return "webSearch";
      if (selectedModel?.isCloud()) return "turbo";
    }
    return null;
  };

  const activeFeatureForBanner = getActiveFeatureForBanner();

  const resetChatForm = () => {
    setMessage({
      content: "",
      attachments: [],
      fileErrors: [],
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Clear loginPromptFeature when user becomes authenticated or no features are enabled
  useEffect(() => {
    if (
      isAuthenticated ||
      cloudDisabled ||
      (!webSearchEnabled && !!selectedModel?.isCloud())
    ) {
      setLoginPromptFeature(null);
    }
  }, [isAuthenticated, webSearchEnabled, selectedModel, cloudDisabled]);

  // When entering edit mode, populate the composition with existing data
  useEffect(() => {
    if (!editingMessage) {
      // Clear composition and reset textarea height when not editing
      resetChatForm();
      return;
    }

    const existingAttachments =
      editingMessage.originalMessage?.attachments || [];
    setMessage({
      content: editingMessage.content,
      attachments: existingAttachments.map((att) => ({
        id: crypto.randomUUID(),
        filename: att.filename,
        // No data for existing files - backend will handle them
      })),
      fileErrors: [],
    });
  }, [editingMessage]);

  // Focus and setup textarea when editing
  useLayoutEffect(() => {
    if (editingMessage && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.transition =
        "height 0.2s ease-out, opacity 0.3s ease-in";
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 24 * 8) + "px";
    }
  }, [editingMessage]);

  // Clear composition and reset textarea height when chatId changes
  useEffect(() => {
    resetChatForm();
  }, [chatId]);

  // Auto-focus textarea when autoFocus is true or when streaming completes (but not when editing)
  useEffect(() => {
    if ((autoFocus || !isStreaming) && textareaRef.current && !editingMessage) {
      const timer = setTimeout(
        () => {
          textareaRef.current?.focus();
        },
        autoFocus ? 0 : 100,
      );
      return () => clearTimeout(timer);
    }
  }, [autoFocus, isStreaming, editingMessage]);

  const focusChatFormInput = () => {
    // Focus textarea after model selection or navigation
    if (textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  // Navigation helper function
  const navigateToNextElement = useCallback(
    (current: HTMLElement, direction: "next" | "prev") => {
      const elements = [
        textareaRef,
        modelSupportsThinkingLevels ? thinkingLevelButtonRef : thinkButtonRef,
        webSearchButtonRef,
        modelPickerRef,
        submitButtonRef,
      ]
        .map((ref) => ref.current)
        .filter(Boolean) as HTMLElement[];
      const index = elements.indexOf(current);
      if (index === -1) return;
      const nextIndex =
        direction === "next"
          ? (index + 1) % elements.length
          : (index - 1 + elements.length) % elements.length;
      elements[nextIndex].focus();
    },
    [],
  );

  // Focus textarea when navigating to a chat (when chatId changes)
  useEffect(() => {
    if (chatId !== "new") {
      focusChatFormInput();
    }
  }, [chatId]);

  // Global keyboard and paste event handlers
  useEffect(() => {
    const focusTextareaIfAppropriate = (target: HTMLElement) => {
      if (
        !textareaRef.current ||
        textareaRef.current === document.activeElement
      ) {
        return;
      }

      const isEditableTarget =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true" ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("[contenteditable='true']");

      if (!isEditableTarget) {
        textareaRef.current.focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle escape key for canceling
      if (e.key === "Escape") {
        e.preventDefault();
        if (editingMessage && onCancelEdit) {
          handleCancelEdit();
        } else if (isStreaming) {
          handleCancel();
        }
        return;
      }

      // Handle Tab navigation between controls
      if (e.key === "Tab" && e.target !== textareaRef.current) {
        const target = e.target as HTMLElement;
        const focusableElements = [
          modelSupportsThinkingLevels
            ? thinkingLevelButtonRef.current
            : thinkButtonRef.current,
          webSearchButtonRef.current,
          modelPickerRef.current,
          submitButtonRef.current,
        ].filter(Boolean) as HTMLElement[];

        if (focusableElements.includes(target)) {
          e.preventDefault();
          if (e.shiftKey) {
            navigateToNextElement(target, "prev");
          } else {
            navigateToNextElement(target, "next");
          }
          return;
        }
      }

      // Handle paste shortcuts
      const isPasteShortcut = (e.ctrlKey || e.metaKey) && e.key === "v";
      if (isPasteShortcut) {
        focusTextareaIfAppropriate(e.target as HTMLElement);
        return;
      }

      // Handle auto-focus when typing printable characters
      const target = e.target as HTMLElement;
      const isInInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (
        !isInInputField &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        textareaRef.current
      ) {
        textareaRef.current.focus();
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      focusTextareaIfAppropriate(e.target as HTMLElement);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handlePaste);
    };
  }, [isStreaming, editingMessage, onCancelEdit, navigateToNextElement]);

  const handleSubmit = async () => {
    if (!message.content.trim() || isStreaming || isDownloading) return;

    if (cloudDisabled && selectedModel?.isCloud()) {
      return;
    }

    // Check if cloud mode is enabled but user is not authenticated
    if (shouldShowLoginBanner) {
      return;
    }

    // Prepare attachments for submission, excluding unsupported images
    const attachmentsToSend: FileAttachment[] = message.attachments
      .filter(
        (att) => hasVisionCapability || !isImageFile(att.filename),
      )
      .map((att) => ({
        filename: att.filename,
        data: att.data || new Uint8Array(0), // Empty data for existing files
      }));

    const useWebSearch =
      supportsWebSearch && webSearchEnabled && !cloudDisabled;
    const useThink = modelSupportsThinkingLevels
      ? thinkLevel
      : supportsThinkToggling
        ? thinkEnabled
        : undefined;

    if (onSubmit) {
      onSubmit(message.content, {
        attachments: attachmentsToSend,
        index: undefined,
        webSearch: useWebSearch,
        think: useThink,
      });
    } else {
      sendMessageMutation({
        message: message.content,
        attachments: attachmentsToSend,
        webSearch: useWebSearch,
        think: useThink,
        onChatEvent: (event) => {
          if (event.eventName === "chat_created" && event.chatId) {
            navigate({
              to: "/c/$chatId",
              params: {
                chatId: event.chatId,
              },
            });
          }
        },
      });
    }

    // Clear composition after successful submission
    setMessage({
      content: "",
      attachments: [],
      fileErrors: [],
    });

    // Reset textarea height and refocus after submit
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Enter to submit
    if (e.key === "Enter" && !e.shiftKey && !isEditing) {
      e.preventDefault();
      if (!isStreaming && !isDownloading) {
        handleSubmit();
      }
      return;
    }

    // Handle Tab navigation
    if (e.key === "Tab") {
      e.preventDefault();
      const focusableElements = [
        modelSupportsThinkingLevels
          ? thinkingLevelButtonRef.current
          : thinkButtonRef.current,
        webSearchButtonRef.current,
        modelPickerRef.current,
        submitButtonRef.current,
      ].filter(Boolean);

      if (e.shiftKey) {
        // Shift+Tab: focus last focusable element
        const lastElement = focusableElements[focusableElements.length - 1];
        lastElement?.focus();
      } else {
        // Tab: focus first focusable element
        const firstElement = focusableElements[0];
        firstElement?.focus();
      }
      return;
    }
  };

  const handleCompositionStart = () => {
    if (compositionEndTimeoutRef.current) {
      window.clearTimeout(compositionEndTimeoutRef.current);
    }
    setIsEditing(true);
  };

  const handleCompositionEnd = () => {
    // Add a small delay to handle the timing issue where Enter keydown
    // fires immediately after composition end
    compositionEndTimeoutRef.current = window.setTimeout(() => {
      setIsEditing(false);
    }, 10);
  };

  const handleCancel = () => {
    cancelMessage(chatId);
  };

  const handleCancelEdit = () => {
    // Clear composition and call parent callback
    setMessage({
      content: "",
      attachments: [],
      fileErrors: [],
    });

    onCancelEdit?.();

    // Focus the textarea after canceling edit mode
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
    });

    // Reset file input
    if (e.target) {
      e.target.value = "";
    }
  };

  // Auto-resize textarea function
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage((prev) => ({ ...prev, content: e.target.value }));

    // Reset height to auto to get the correct scrollHeight, then cap at 8 lines
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 24 * 8) + "px";
  };

  const handleFilesUpload = async () => {
    try {
      setFileUploadError(null);

      const results = await window.webview?.selectMultipleFiles();
      if (results && results.length > 0) {
        // Convert native dialog results to File objects
        const files = results
          .map((result: ImageData) => {
            if (result.dataURL) {
              // Convert dataURL back to File object
              const base64Data = result.dataURL.split(",")[1];
              const mimeType = result.dataURL.split(";")[0].split(":")[1];
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              const blob = new Blob([bytes], { type: mimeType });
              const file = new File([blob], result.filename, {
                type: mimeType,
              });
              return file;
            }
            return null;
          })
          .filter(Boolean) as File[];

        if (files.length > 0) {
          const { validFiles, errors } = await processFiles(files, {
            selectedModel,
            hasVisionCapability,
          });

          // Send processed files and errors to the same handler as FileUpload
          if (validFiles.length > 0 || errors.length > 0) {
            handleFilesReceived(validFiles, errors);
          }
        }
      }
    } catch (error) {
      console.error("Error selecting multiple files:", error);

      const errorEvent = new ErrorEvent({
        eventName: "error" as const,
        error:
          error instanceof Error ? error.message : "Failed to select files",
        code: "file_selection_error",
        details:
          "An error occurred while trying to open the file selection dialog. Please try again.",
      });

      setFileUploadError(errorEvent);
    }
  };
  return (
    <div className={`pb-3 px-3 ${hasMessages ? "mt-auto" : "my-auto"}`}>
      {chatId === "new" && <Logo />}

      {shouldShowLoginBanner && (
        <DisplayLogin
          error={
            new ErrorEvent({
              eventName: "error",
              error:
                activeFeatureForBanner === "webSearch"
                  ? "Web search requires authentication"
                  : "Cloud models require authentication",
              code: "cloud_unauthorized",
            })
          }
          message={
            activeFeatureForBanner === "webSearch"
              ? "Web search requires an Ollama account"
              : "Cloud models require an Ollama account"
          }
          className="mb-4"
          onDismiss={() => {
            // Disable the active features when dismissing
            if (webSearchEnabled) setSettings({ WebSearchEnabled: false });
            setLoginPromptFeature(null);
          }}
        />
      )}

      {/* File upload error message */}
      {fileUploadError && <ErrorMessage error={fileUploadError} />}
      <div
        className={`relative mx-auto flex bg-neutral-100 w-full max-w-[768px] flex-col items-center rounded-3xl pb-2 pt-4 dark:bg-neutral-800 dark:border-neutral-700 min-h-[88px] transition-opacity duration-200 ${isDisabled ? "opacity-50" : "opacity-100"}`}
      >
        {isDisabled && (
          // overlay to block interaction
          <div className="absolute inset-0 z-50 rounded-3xl" />
        )}
        {editingMessage && (
          <div className="w-full px-5 pb-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Press ESC to cancel editing
            </p>
          </div>
        )}
        {(message.attachments.length > 0 || message.fileErrors.length > 0) && (
          <div className="flex gap-2 overflow-x-auto px-3 pt pb-3 w-full scrollbar-hide">
            {message.attachments.map((attachment, index) => {
              const isUnsupportedImage =
                !hasVisionCapability && isImageFile(attachment.filename);
              return (
              <div
                key={attachment.id}
                className={`group flex items-center gap-2 py-2 px-3 rounded-lg transition-colors flex-shrink-0 ${
                  isUnsupportedImage
                    ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                    : "bg-neutral-50 dark:bg-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                }`}
              >
                {isImageFile(attachment.filename) ? (
                  <ImageThumbnail
                    image={{
                      filename: attachment.filename,
                      data: attachment.data || new Uint8Array(0),
                    }}
                    className="w-8 h-8 object-cover rounded-md flex-shrink-0"
                  />
                ) : (
                  <svg
                    className="w-4 h-4 text-neutral-400 dark:text-neutral-500 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                <div className="flex flex-col min-w-0">
                  <span className={`text-sm max-w-36 truncate ${isUnsupportedImage ? "text-red-700 dark:text-red-300" : "text-neutral-700 dark:text-neutral-300"}`}>
                    {attachment.filename}
                  </span>
                  {isUnsupportedImage && (
                    <span className="text-xs text-red-600 dark:text-red-400 opacity-75">
                      This model does not support images
                    </span>
                  )}
                </div>
                <IconButton
                  size="sm"
                  icon="close"
                  label={`Remove ${attachment.filename}`}
                  onClick={() => removeFile(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity -mr-1 cursor-pointer"
                />
              </div>
              );
            })}
            {message.fileErrors.map((fileError, index) => (
              <div
                key={`error-${index}`}
                className="group flex items-center gap-2 py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex-shrink-0"
              >
                <svg
                  className="w-4 h-4 text-red-500 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-red-700 dark:text-red-300 max-w-[100px] truncate">
                  {fileError.filename}
                </span>
                <span className="text-xs text-red-600 dark:text-red-400 opacity-75">
                  • {fileError.error}
                </span>
                <IconButton
                  size="sm"
                  icon="close"
                  danger
                  label={`Remove ${fileError.filename}`}
                  onClick={() => removeFileError(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity -mr-1 ml-auto"
                />
              </div>
            ))}
          </div>
        )}

        <div className="relative w-full px-5">
          <textarea
            ref={textareaRef}
            value={message.content}
            onChange={handleTextareaChange}
            placeholder="Send a message"
            disabled={isDisabled}
            className={`allow-context-menu w-full overflow-y-auto text-neutral-700 outline-none resize-none border-none bg-transparent dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 min-h-[24px] leading-6 transition-opacity duration-300 ${
              editingMessage ? "animate-fade-in" : ""
            }`}
            rows={1}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </div>

        {/* Controls */}
        <div className="flex w-full items-center justify-end gap-2 px-3 pt-2">
          {/* Tool buttons - animate from underneath model picker */}
          {!isDisabled && (
            <div className="flex-1 flex justify-end items-center gap-2">
              <div className={`flex gap-2`}>
                {/* File Upload Buttons */}
                <IconButton
                  size="sm"
                  icon="add"
                  label="Upload multiple files"
                  onClick={handleFilesUpload}
                  className="bg-white dark:bg-neutral-700 cursor-pointer border border-transparent"
                />
                {/* Thinking Level Button */}
                {modelSupportsThinkingLevels && (
                  <>
                    <ThinkButton
                      mode="thinkingLevel"
                      ref={thinkingLevelButtonRef}
                      isVisible={modelSupportsThinkingLevels}
                      currentLevel={thinkLevel}
                      onLevelChange={setThinkingLevel}
                      onDropdownToggle={handleThinkingLevelDropdownToggle}
                    />
                  </>
                )}
                {/* Think Button turn on and off */}
                {supportsThinkToggling && !modelSupportsThinkingLevels && (
                  <>
                    <ThinkButton
                      mode="think"
                      ref={thinkButtonRef}
                      isVisible={
                        supportsThinkToggling && !modelSupportsThinkingLevels
                      }
                      isActive={thinkEnabled}
                      onToggle={() => {
                        // DeepSeek-v3 specific - thinking and web search are mutually exclusive
                        if (supportsThinkToggling) {
                          const enable = !thinkEnabled;
                          setSettings({
                            ThinkEnabled: enable,
                            ...(enable ? { WebSearchEnabled: false } : {}),
                          });
                          return;
                        }
                        setSettings({ ThinkEnabled: !thinkEnabled });
                      }}
                    />
                  </>
                )}
                <WebSearchButton
                  ref={webSearchButtonRef}
                  isVisible={supportsWebSearch && cloudDisabled === false}
                  isActive={webSearchEnabled}
                  onToggle={() => {
                    if (!webSearchEnabled && !isAuthenticated) {
                      setLoginPromptFeature("webSearch");
                    }
                    const enable = !webSearchEnabled;
                    if (supportsThinkToggling && enable) {
                      setSettings({
                        WebSearchEnabled: true,
                        ThinkEnabled: false,
                      });
                      return;
                    }
                    setSettings({ WebSearchEnabled: enable });
                  }}
                />
              </div>
            </div>
          )}

          {/* Model picker and submit button */}
          <div className="flex items-center gap-2 relative z-20">
            <ModelPicker
              ref={modelPickerRef}
              chatId={chatId}
              onModelSelect={focusChatFormInput}
              onEscape={focusChatFormInput}
              isDisabled={isDisabled}
              onDropdownToggle={handleModelPickerDropdownToggle}
            />
            {/* Was a raw <button> with two bespoke inline SVGs and hardcoded
                bg-black/bg-white plus a focus:ring-blue-500 that belongs to no
                palette in this app. It stayed raw only because IconButton could
                not take a ref, and this ref is load-bearing for the composer's
                Tab / Shift-Tab roving focus. */}
            <IconButton
              buttonRef={submitButtonRef}
              variant="filled"
              icon={isStreaming || isDownloading ? "stop" : "arrow_upward"}
              label={
                isStreaming || isDownloading ? "Stop generating" : "Send message"
              }
              onClick={
                isStreaming || isDownloading ? handleCancel : handleSubmit
              }
              disabled={
                !isStreaming &&
                !isDownloading &&
                (!message.content.trim() ||
                  shouldShowLoginBanner ||
                  (cloudDisabled && selectedModel?.isCloud()) ||
                  message.fileErrors.length > 0)
              }
            />
          </div>
        </div>
      </div>

      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}

export default ChatForm;
