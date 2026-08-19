# File Converter

## Behaviour

The Toolbox screen's Converter section (`app/ui/app/src/screens/toolbox/ConverterSection.tsx`, 302 lines) is a real, backend-driven file converter, not a static mock: `GET /api/v1/convert/catalog` (`app/ui/convert.go`'s `convertCatalog()`, 2951 lines total) returns the eight required categories (Documents/PDF, Images, Audio, Video, Archives, Structured Data, Code/Text, Binary Encodings), each format explicit about whether it is genuinely usable. Format availability never uses `PATH` discovery -- `externalTool()`'s own doc comment states it plainly ("It never consults `PATH`") -- it checks a single fixed, executable-relative `lib/converters/<name>[.exe]` location (`externalConverterDir()`, mirroring `app/server/server.go`'s own `resolvePath`); a missing binary there disables the format and reports the exact missing dependency name and expected path rather than hiding the gap, which `ConvertCategoryList.dom.test.tsx`'s "shows a disabled format's exact missing dependency and expected path, never hiding it" proves directly, alongside "does not let a disabled format be selected".

The category list carries its own local filter with a `.* ` regex toggle -- `ConvertCategoryList.dom.test.tsx`'s "filters formats by the search field, plain text by default" and "filters formats by regex once the .* toggle is on" both pass against the real component. Conversion itself picks a file through the native OS picker (`pickConvertFile`), probes it (`probeConvertFile`) for a real, format-specific loss disclosure before anything lossy runs, and queues the job through `useConvertQueue.ts` against a live SSE stream rather than polling. Go-side coverage is genuinely deep on the parts most likely to hide a defect silently: `TestConvertManager_RefusesPathThePickerNeverIssued` and `TestConvertManager_ExpiredPickedPathIsRefusedAndPruned` (the picker-issued-path allowlist, closing an arbitrary-file-read hole), `TestValidateOutput_RejectsCorruptStructuredResult`/`RejectsCorruptImageResult` (output validation before a result is ever offered), and a full orphaned-job recovery suite (`convert_queue_restart_test.go`'s five tests) proving a job interrupted mid-run is reset to queued and its temp file cleaned up on the next load, idempotently.

PDF support (`convert_pdf_test.go`) extracts real text from a minimal real PDF, rejects a non-PDF file outright, and treats an empty page as empty output rather than an error -- matching the canonical contract's specific PDF/inspect requirements at least for text extraction; split/merge/extract/reorder/rotate/metadata tools were not found in this pass and are not claimed here.

This article does not verify whether the external converter binaries `lib/converters/` expects are actually present in a packaged installer -- that is a packaging question outside what reading the source and running the test suite can prove, and is not claimed as verified here.

## Configuration

TODO(file-converter): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(file-converter): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(file-converter): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(file-converter): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(file-converter): link the related features, the prerequisites, and the natural next article a reader should open.
