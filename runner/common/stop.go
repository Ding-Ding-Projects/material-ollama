package main

import (
	"strings"

	"github.com/ollama/ollama/llm"
)

func FindStop(sequence string, stops []string) (bool, string) {
	for _, stop := range stops {
		if strings.Contains(sequence, stop) {
			return true, stop
		}
	}

	return false, ""
}

// maybeStop returns true if the provided sequence ends with
// the start of any of the provided stop sequences, meaning
// a stop sequence is likely to follow
func maybeStop(sequence string, stops []string) bool {
	for _, stop := range stops {
		for i := 1; i <= len(stop); i++ {
			if strings.HasSuffix(sequence, stop[:i]) {
				return true
			}
		}
	}

	return false
}

// truncateStop removes the provided stop string from pieces,
// returning the partial pieces with stop removed, including truncating
// the last piece if required
func truncateStop(pieces []string, stop string) []string {
	joined := strings.Join(pieces, "")

	index := strings.Index(joined, stop)
	if index == -1 {
		return pieces
	}

	idx := strings.Index(sequence, stop)
	if idx < 0 {
		return resps, false
	}

	var result []string
	start := 0
	for _, piece := range pieces {
		if start >= len(joined) {
			break
		}

		end := start + len(piece)
		if end > len(joined) {
			end = len(joined)
		}
		if len(chunk) > 0 {
			result = append(result, llm.CompletionResponse{Content: chunk})
		}
		pos += len(resp.Content)
	}

	return result
}
