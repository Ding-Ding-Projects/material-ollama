import { describe, expect, it, vi } from "vitest";
import { parseJsonlFromStream } from "./jsonl-parsing";

/**
 * Real streaming failure modes for the SSE/NDJSON chat transport's own
 * line-reassembly logic -- a happy-path test where every JSON.parse call
 * gets a complete line handed to it in a single chunk can never see any of
 * these, because the whole point of streaming a chat response is that the
 * network delivers bytes in whatever chunk boundaries it feels like, not
 * ones that respect JSON syntax or even UTF-8 code point boundaries.
 */

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else {
        controller.close();
      }
    },
  });
}

function streamFromStrings(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return streamFromChunks(parts.map((part) => encoder.encode(part)));
}

async function collect<T>(stream: ReadableStream<Uint8Array>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of parseJsonlFromStream<T>(stream)) {
    out.push(value);
  }
  return out;
}

describe("parseJsonlFromStream", () => {
  it("reassembles a single JSON line whose bytes arrive split across the '{' ... '}' boundary of the object itself", async () => {
    // A real chat-token stream frequently splits mid-object: the network
    // chunk boundary has no idea where a JSON token starts or ends. If the
    // parser instead tried to JSON.parse each chunk independently (rather
    // than buffering until a full line is available), both halves below
    // would fail to parse and the caller would silently lose the token.
    const stream = streamFromStrings([
      '{"model":"llama3.2","message":{"role":"assistant","content":"hel',
      'lo world"},"done":fal',
      'se}\n',
    ]);

    const results = await collect<{ message: { content: string }; done: boolean }>(stream);

    expect(results).toEqual([
      { model: "llama3.2", message: { role: "assistant", content: "hello world" }, done: false },
    ]);
  });

  it("decodes a multi-byte UTF-8 character whose raw bytes are split across two chunks", async () => {
    // TextDecoder's { stream: true } mode exists precisely so a multi-byte
    // sequence cut in half by a chunk boundary is buffered internally and
    // completed by the decoder itself, rather than emitting a replacement
    // character (U+FFFD) for each half. A streamed chat response containing
    // any non-ASCII text (Cantonese, emoji, accented characters) can be
    // split exactly this way at any byte offset, independent of where line
    // breaks fall.
    const encoder = new TextEncoder();
    const line = JSON.stringify({ content: "café 🎉 你好" }) + "\n";
    const fullBytes = encoder.encode(line);

    // Split at a byte offset that lands inside the multi-byte UTF-8
    // encoding of a non-ASCII character (both a 2-byte accented character
    // and, further along, a 4-byte emoji are present in this payload, so a
    // fixed midpoint split reliably lands inside one multi-byte sequence
    // rather than needing to hand-compute the exact code point boundary).
    const splitPoint = Math.floor(fullBytes.length / 2);
    const chunkA = fullBytes.slice(0, splitPoint);
    const chunkB = fullBytes.slice(splitPoint);

    const stream = streamFromChunks([chunkA, chunkB]);
    const results = await collect<{ content: string }>(stream);

    expect(results).toEqual([{ content: "café 🎉 你好" }]);
  });

  it("keeps yielding well-formed lines after one malformed line in the same stream, instead of aborting the whole stream", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const stream = streamFromStrings([
        '{"n":1}\n',
        "{not valid json at all}\n",
        '{"n":2}\n',
      ]);

      const results = await collect<{ n: number }>(stream);

      // The malformed line is logged and skipped -- it must not stop the
      // generator, and it must not silently merge with its neighbours into
      // a garbage third value either.
      expect(results).toEqual([{ n: 1 }, { n: 2 }]);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("parses a final line that has no trailing newline once the stream reports done", async () => {
    // A real server can close the connection right after its last token
    // without writing a final '\n' -- the done:true message in particular
    // is often the very last thing written before the socket closes. This
    // is the buffer.trim() branch that only runs on the `done` case, not
    // the per-chunk line-splitting branch above.
    const stream = streamFromStrings(['{"n":1}\n', '{"done":true}']);

    const results = await collect<Record<string, unknown>>(stream);

    expect(results).toEqual([{ n: 1 }, { done: true }]);
  });
});
