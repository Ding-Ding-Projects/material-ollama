package newrunner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image"
	"io"
	"log"
	"log/slog"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/sync/semaphore"

	"github.com/ollama/ollama/api"
	"github.com/ollama/ollama/model"
	"github.com/ollama/ollama/runner/common"
	"github.com/ollama/ollama/sample"

	_ "github.com/ollama/ollama/model/llama"
	_ "github.com/ollama/ollama/model/mllama"
	_ "github.com/ollama/ollama/model/qwen2"
)

// input is an element of the prompt to process, either
// a token or an image embedding (generated from a vision projector)
type input struct {
	token int32

	// embed is an image embedding
	//embed []float32

	image image.Image
}

type Sequence struct {
	// batch index
	iBatch int

	// prompt inputs left to evaluate
	inputs []input

	// inputs that have been added to a batch but not yet submitted to Decode
	pendingInputs []input

	// TODO: update this comment
	// tokens that have been generated but not returned yet (e.g. for stop sequences)
	pendingResponses []CompletionResponse

	// input cache being used by this sequence
	cache *InputCacheSlot

	// channel to send responses over
	responses chan CompletionResponse

	// channel to stop decoding (such as if the remote connection is closed)
	quit chan bool

	// number of tokens to predict
	numPredict int

	// set of samplers to run on generated logits
	samplers []sample.Sampler

	// channel to send back the embedding if embedding only
	embedding chan []float32

	// stop sequences
	stop []string

	// number of inputs to keep at the beginning when shifting context window
	numKeep int

	// true if an embedding are to be returned instead of text generation
	embeddingOnly bool

	doneReason string

	logits []float32

	// number of logprobs to return with the completion response
	logprobs int

	// Metrics
	startProcessingTime time.Time
	startGenerationTime time.Time
	numPredicted        int
	numPromptInputs     int

	// New flag we need to add to Sequence struct
	returnLogits bool

	// Using our new GetLogits() method
	logits []float32

	// Add new channel for logits
	logitsOut chan []float32
}

type NewSequenceParams struct {
	numPredict int
	stop       []string
	numKeep    int
	samplers   []sample.Sampler
	embedding  bool
}

func (s *Server) NewSequence(prompt string, images []ImageData, params NewSequenceParams) (*Sequence, error) {
	s.ready.Wait()

	startTime := time.Now()

	inputs, err := s.inputs(prompt, images)
	if err != nil {
		return nil, fmt.Errorf("failed to process inputs: %w", err)
	} else if len(inputs) == 0 {
		return nil, errors.New("no input provided")
	}

	if params.numKeep < 0 {
		params.numKeep = len(inputs)
	}

	// Ensure that at least 1 input can be discarded during shift
	params.numKeep = min(params.numKeep, s.cache.numCtx-1)

	if len(inputs) > s.cache.numCtx {
		discard := len(inputs) - s.cache.numCtx
		newInputs := inputs[:params.numKeep]
		newInputs = append(newInputs, inputs[params.numKeep+discard:]...)

		slog.Warn("truncating input prompt", "limit", s.cache.numCtx, "prompt", len(inputs), "keep", params.numKeep, "new", len(newInputs))
		inputs = newInputs
	}

	// TODO(jessegross): Ingest cached history for grammar

	return &Sequence{
		inputs:              inputs,
		numPromptInputs:     len(inputs),
		startProcessingTime: startTime,
		numPredict:          params.numPredict,
		pendingResponses:    make([]string, 0),
		responses:           make(chan CompletionResponse, 100),
		quit:                make(chan bool, 1),
		embedding:           make(chan []float32, 1),
		samplers:            params.samplers,
		embeddingOnly:       params.embedding,
		stop:                params.stop,
		numKeep:             params.numKeep,
		returnLogits:        params.returnLogits,
		logitsOut:           make(chan []float32, 100),
	}, nil
}

// inputs processes the prompt and images into a list of inputs
// by splitting the prompt on [img-<n>] tags, tokenizing text and
// generating image embeddings for each image
func (s *Server) inputs(prompt string, images []ImageData) ([]input, error) {
	var inputs []input
	var parts []string
	var matches [][]string

	//if s.image != nil {
	re := regexp.MustCompile(`\[img-(\d+)\]`)
	parts = re.Split(prompt, -1)
	matches = re.FindAllStringSubmatch(prompt, -1)
	/*} else {
		parts = []string{prompt}
	}*/

	for i, part := range parts {
		// text - tokenize
		tokens, err := s.model.(model.TextProcessor).Encode(part)
		if err != nil {
			return nil, err
		}

		for _, t := range tokens {
			inputs = append(inputs, input{token: t})
		}

		// image - generate image embedding
		if i < len(matches) {
			n, _ := strconv.Atoi(matches[i][1])

			imageIndex := -1
			for j := range images {
				if images[j].ID == n {
					imageIndex = j
					break
				}
			}

			if imageIndex < 0 {
				return nil, fmt.Errorf("invalid image index: %d", n)
			}

			image, _, err := image.Decode(bytes.NewReader(images[imageIndex].Data))
			if err != nil {
				return nil, err
			}

			inputs = append(inputs, input{image: image})

			/*embed, err := s.image.NewEmbed(s.lc, images[imageIndex].Data, images[imageIndex].AspectRatioID)
			if err != nil {
				return nil, err
			}

			for _, e := range embed {
				inputs = append(inputs, input{embed: e})
			}*/
		}
	}

	return inputs, nil
}

type Server struct {
	// is the server ready to process requests?
	// protects access to model and image
	ready sync.WaitGroup

	// loaded model
	model model.Model

	// status for external health reporting - loading, ready to serve, etc.
	status ServerStatus

	// current progress on loading the model
	progress float32

	// number of simultaneous requests to handle
	parallel int

	// maximum number of elements in a batch (per sequence)
	// TODO (jmorganca): make this n_batch
	batchSize int

	// protects access to everything below this line
	// this is context state needed for decoding
	mu sync.Mutex

	// indicates that data is ready for processing
	cond *sync.Cond

	// the list of simultaneous sequences being evaluated
	seqs []*Sequence

	// seqs can have a maximum of parallel entries, which
	// is enfoced by seqSem
	seqsSem *semaphore.Weighted

	// KV cache
	cache *InputCache

	// next sequence for prompt processing to avoid starvation
	// TODO(jessegross): Currently unused
	nextSeq int
}

func (s *Server) allNil() bool {
	for _, item := range s.seqs {
		if item != nil {
			return false
		}
	}
	return true
}

func flushPending(seq *Sequence) bool {
	if len(seq.pendingResponses) == 0 {
		return true
	}

	content := strings.Join(seq.pendingResponses, "")
	// Check if there are any partial UTF-8 characters remaining.
	// We already check and queue as we are generating but some may
	// still make it here:
	// - Sequence is ending, e.g. generation limit has been hit
	// - Invalid characters in the middle of a string
	// This is a stricter check to ensure we never output invalid Unicode.
	for !utf8.ValidString(content) {
		content = content[:len(content)-1]
	}
	seq.pendingResponses = nil

	resp := CompletionResponse{
		Content: content,
	}

	// Add logits if requested and available
	if seq.returnLogits && seq.logits != nil {
		resp.Logits = seq.logits
		seq.logits = nil
	}

	select {
	case seq.responses <- resp:
		return true
	case <-seq.quit:
		return false
	}
	seq.pendingResponses = []CompletionResponse{}

	// TODO: figure out this result logic
	result := false
	for _, resp := range resps {
		// Check if there are any partial UTF-8 characters remaining.
		// We already check and queue as we are generating but some may
		// still make it here:
		// - Sequence is ending, e.g. generation limit has been hit
		// - Invalid characters in the middle of a string
		// This is a stricter check to ensure we never output invalid Unicode.
		for !utf8.ValidString(resp.Content) {
			resp.Content = resp.Content[:len(resp.Content)-1]
		}

		select {
		case seq.responses <- resp:
			result = true
		case <-seq.quit:
			result = false
		}
	}

	return result
}

func (s *Server) removeSequence(seqIndex int, reason string) {
	seq := s.seqs[seqIndex]

	flushPending(seq)
	seq.doneReason = reason
	close(seq.responses)
	close(seq.embedding)
	seq.cache.InUse = false
	s.seqs[seqIndex] = nil
	s.seqsSem.Release(1)
}

func (s *Server) run(ctx context.Context) {
	s.ready.Wait()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			err := s.processBatch()
			if err != nil {
				panic(err)
			}
		}
	}
}

func (s *Server) processBatch() error {
	s.mu.Lock()
	for s.allNil() {
		s.cond.Wait() // Wait until an item is added
	}
	defer s.mu.Unlock()

	var inputIDs []int32
	var pos []int32
	var outputs []int32
	var seqs []int

	var image image.Image

	for i, seq := range s.seqs {
		if seq == nil {
			continue
		}

		// if past the num predict limit
		if seq.numPredict > 0 && seq.numPredicted >= seq.numPredict {
			s.removeSequence(i, "limit")
			continue
		}

		for j, input := range seq.inputs {
			if len(seq.cache.Inputs)+len(seq.pendingInputs)+1 > s.cache.numCtx {
				if len(seq.pendingInputs) == 0 {
					err := s.cache.ShiftCacheSlot(seq.cache, seq.numKeep)
					if err != nil {
						return err
					}
				} else {
					break
				}
			}

			if j >= s.batchSize {
				break
			}

			if input.image != nil {
				if image != nil {
					break
				}
				image = input.image
				seq.pendingInputs = append(seq.pendingInputs, input)
				continue
			}

			inputIDs = append(inputIDs, input.token)
			pos = append(pos, int32(len(seq.cache.Inputs)+len(seq.pendingInputs)))
			seqs = append(seqs, seq.cache.Id)

			seq.iBatch = len(outputs)
			if j+1 == len(seq.inputs) {
				outputs = append(outputs, int32(len(inputIDs)-1))
			}
			seq.pendingInputs = append(seq.pendingInputs, input)
		}

		seq.inputs = seq.inputs[len(seq.pendingInputs):]
	}

	if len(inputIDs) == 0 {
		return nil
	}

	var options []model.OptionsFunc
	if image != nil {
		options = append(options, model.WithImage(image))
	}

	ctx := s.model.Backend().NewContext()
	defer ctx.Close()

	logit, err := model.Forward(ctx, s.model, append(options, model.WithCache(s.cache.cache), model.WithInputIDs(inputIDs), model.WithPositions(pos), model.WithOutputs(outputs), model.WithSequences(seqs))...)
	if err != nil {
		return err
	}

	f32s := logit.Floats()

	var totalSamplingTime time.Duration
	for i, seq := range s.seqs {
		if seq == nil {
			continue
		}

		// After calling Forward, pending inputs are now in the cache
		if len(seq.pendingInputs) > 0 {
			seq.cache.Inputs = append(seq.cache.Inputs, seq.pendingInputs...)
			seq.pendingInputs = []input{}
		}

		// don't sample prompt processing
		if len(seq.inputs) != 0 {
			continue
		}

		seq.numPredicted++
		if seq.numPredicted == 1 {
			seq.startGenerationTime = time.Now()
		}

		// if done processing the prompt, generate an embedding and return
		if seq.embeddingOnly {
			/*embed := s.lc.GetEmbeddingsSeq(seq.cache.Id)
			if embed == nil {
				embed = s.lc.GetEmbeddingsIth(seq.iBatch)
			}

			seq.embedding <- embed*/
			s.removeSequence(i, "")
			continue
		}

		vocabSize := len(f32s) / len(outputs)
		seqLogits := f32s[seq.iBatch*vocabSize : (seq.iBatch+1)*vocabSize]

		// TODO(jessegross): The data type and number of outputs for the samplers seem inconsistent
		f64s := make([]float64, vocabSize)
		for j, f32 := range seqLogits {
			f64s[j] = float64(f32)
		}

		// do sampling
		f64s, err = sample.Sample(f64s, seq.samplers...)
		if err != nil {
			return err
		}

		var outputIDs []int32
		for _, f64 := range f64s {
			if !s.model.(model.TextProcessor).Is(uint32(f64), model.SpecialEOS) {
				outputIDs = append(outputIDs, int32(f64))
			} else {
				s.removeSequence(i, "stop")
				continue
			}
		}

		if len(outputIDs) == 0 {
			continue
		}

		piece, err := s.model.(model.TextProcessor).Decode(outputIDs)
		if errors.Is(err, io.EOF) {
			continue
		} else if err != nil {
			return err
		}

		for _, id := range outputIDs {
			seq.inputs = append(seq.inputs, input{token: id})
		}

		// TODO: add probs here
		seq.pendingResponses = append(seq.pendingResponses, resp)
		var sequence string
		for _, r := range seq.pendingResponses {
			sequence += r.Content
		}

		if ok, stop := common.FindStop(sequence, seq.stop); ok {
			slog.Debug("hit stop token", "pending", seq.pendingResponses, "stop", stop)

			// TODO: fix this stop sequence caching
			var tokenTruncated bool
			origLen := len(seq.pendingResponses)
			seq.pendingResponses, tokenTruncated = common.TruncateStop(seq.pendingResponses, stop)
			newLen := len(seq.pendingResponses)

			// Update the cache based on the tokens that will be returned:
			// - We have more tokens than are currently in the cache because
			// the last ones generated weren't submitted to Forward
			// - Remove any stop sequences that we stripped out
			// - If truncateStop removed a portion of a token, drop that
			// - As defense-in-depth, if truncatedToken didn't find a stop token
			// remove the extra ones that we added to the cache len
			tokenLen := len(seq.cache.Inputs) + len(outputIDs)
			tokenLen -= origLen - newLen
			if tokenTruncated {
				tokenLen--
			}
			if origLen == newLen {
				tokenLen = len(seq.cache.Inputs)
			}
			seq.cache.Inputs = seq.cache.Inputs[:tokenLen]

			s.removeSequence(i, "stop")
			continue
		}

		if common.ContainsStopSuffix(sequence, seq.stop) {
			continue
		}

		if common.IncompleteUnicode(sequence) {
			continue
		}

		if !flushPending(seq) {
			s.removeSequence(i, "connection")
		}
	}

	return nil
}

// TODO (jmorganca): use structs from the api package to avoid duplication
// this way the api acts as a proxy instead of using a different api for the
// runner
type Options struct {
	api.Runner

	NumKeep          int      `json:"n_keep"`
	Seed             int      `json:"seed"`
	NumPredict       int      `json:"n_predict"`
	TopK             int      `json:"top_k"`
	TopP             float32  `json:"top_p"`
	MinP             float32  `json:"min_p"`
	TypicalP         float32  `json:"typical_p"`
	RepeatLastN      int      `json:"repeat_last_n"`
	Temperature      float32  `json:"temperature"`
	RepeatPenalty    float32  `json:"repeat_penalty"`
	PresencePenalty  float32  `json:"presence_penalty"`
	FrequencyPenalty float32  `json:"frequency_penalty"`
	Mirostat         int      `json:"mirostat"`
	MirostatTau      float32  `json:"mirostat_tau"`
	MirostatEta      float32  `json:"mirostat_eta"`
	Stop             []string `json:"stop"`
}

type ImageData struct {
	Data          []byte `json:"data"`
	ID            int    `json:"id"`
	AspectRatioID int    `json:"aspect_ratio_id"`
}

type CompletionRequest struct {
	Prompt       string      `json:"prompt"`
	Images       []ImageData `json:"image_data"`
	Grammar      string      `json:"grammar"`
	CachePrompt  bool        `json:"cache_prompt"`
	ReturnLogits bool        `json:"return_logits,omitempty"` // defaults to false

	Options
}

type Timings struct {
	PredictedN  int     `json:"predicted_n"`
	PredictedMS float64 `json:"predicted_ms"`
	PromptN     int     `json:"prompt_n"`
	PromptMS    float64 `json:"prompt_ms"`
}

type CompletionResponse struct {
	Content string    `json:"content"`
	Logits  []float32 `json:"logits,omitempty"`
	Tokens  []string  `json:"tokens,omitempty"`
	Stop    bool      `json:"stop"`

	Model    string       `json:"model,omitempty"`
	Prompt   string       `json:"prompt,omitempty"`
	LogProbs []TokenProbs `json:"logprobs,omitempty"`

	StoppedLimit bool    `json:"stopped_limit,omitempty"`
	PredictedN   int     `json:"predicted_n,omitempty"`
	PredictedMS  float64 `json:"predicted_ms,omitempty"`
	PromptN      int     `json:"prompt_n,omitempty"`
	PromptMS     float64 `json:"prompt_ms,omitempty"`

	Timings Timings `json:"timings"`
}

func getSamplers(req CompletionRequest) []sample.Sampler {
	/*var samplingParams llama.SamplingParams
	samplingParams.TopK = req.TopK
	samplingParams.TopP = req.TopP
	samplingParams.MinP = req.MinP
	samplingParams.TypicalP = req.TypicalP
	samplingParams.Temp = req.Temperature
	samplingParams.RepeatLastN = req.RepeatLastN
	samplingParams.PenaltyRepeat = req.RepeatPenalty
	samplingParams.PenaltyFreq = req.FrequencyPenalty
	samplingParams.PenaltyPresent = req.PresencePenalty
	samplingParams.Mirostat = req.Mirostat
	samplingParams.MirostatTau = req.MirostatTau
	samplingParams.MirostatEta = req.MirostatEta
	samplingParams.Seed = uint32(req.Seed)
	samplingParams.Grammar = req.Grammar*/

	return []sample.Sampler{sample.Greedy()}
}

func (s *Server) completion(w http.ResponseWriter, r *http.Request) {
	var req CompletionRequest
	req.Options = Options(api.DefaultOptions())
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	// TODO: if grammar is provided, load it
	// if req.Grammar != "" {
	// 	grammar := llama.NewGrammarWithTokens(req.Grammar, "root", s.model.Vocabulary)
	// }
	// defer grammar.Close()
	// sampler := sample.WithGrammar(sample.Greedy(), grammar)

	start := time.Now()
	seq, err := s.NewSequence(req.Prompt, req.Images, NewSequenceParams{
		numPredict: req.NumPredict,
		stop:       req.Stop,
		numKeep:    req.NumKeep,
		samplers:   getSamplers(req),
		embedding:  false,
	})
	slog.Info("new sequence created", "duration", time.Since(start))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create new sequence: %v", err), http.StatusInternalServerError)
		return
	}

	// Ensure there is a place to put the sequence, released when removed from s.seqs
	if err := s.seqsSem.Acquire(r.Context(), 1); err != nil {
		if errors.Is(err, context.Canceled) {
			slog.Info("aborting completion request due to client closing the connection")
		} else {
			slog.Error("Failed to acquire semaphore", "error", err)
		}
		return
	}

	s.mu.Lock()
	found := false
	for i, sq := range s.seqs {
		if sq == nil {
			seq.cache, seq.inputs, err = s.cache.LoadCacheSlot(seq.inputs, req.CachePrompt)
			if err != nil {
				s.mu.Unlock()
				http.Error(w, fmt.Sprintf("Failed to load cache: %v", err), http.StatusInternalServerError)
				return
			}

			s.seqs[i] = seq
			s.cond.Signal()
			found = true
			break
		}
	}
	s.mu.Unlock()

	if !found {
		http.Error(w, "could not find an available sequence", http.StatusInternalServerError)
		return
	}

	for {
		select {
		case <-r.Context().Done():
			close(seq.quit)
			return
		case resp, ok := <-seq.responses:
			if ok {
				// slog.Info("content", "content", content.Content)
				if err := json.NewEncoder(w).Encode(&content); err != nil {
					http.Error(w, fmt.Sprintf("failed to encode response: %v", err), http.StatusInternalServerError)
					close(seq.quit)
					return
				}

				flusher.Flush()
			} else {
				// Send the final response
				if err := json.NewEncoder(w).Encode(&CompletionResponse{
					Stop:         true,
					StoppedLimit: seq.doneReason == "limit",
					Timings: Timings{
						PromptN:     seq.numPromptInputs,
						PromptMS:    float64(seq.startGenerationTime.Sub(seq.startProcessingTime).Milliseconds()),
						PredictedN:  seq.numPredicted,
						PredictedMS: float64(time.Since(seq.startGenerationTime).Milliseconds()),
					},
				}); err != nil {
					http.Error(w, fmt.Sprintf("failed to encode final response: %v", err), http.StatusInternalServerError)
				}

				return
			}
		}
	}
}

type EmbeddingRequest struct {
	Content     string `json:"content"`
	CachePrompt bool   `json:"cache_prompt"`
}

type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

func (s *Server) embeddings(w http.ResponseWriter, r *http.Request) {
	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("bad request: %s", err), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	slog.Debug("embedding request", "content", req.Content)

	seq, err := s.NewSequence(req.Content, nil, NewSequenceParams{embedding: true})
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create new sequence: %v", err), http.StatusInternalServerError)
		return
	}

	// Ensure there is a place to put the sequence, released when removed from s.seqs
	if err := s.seqsSem.Acquire(r.Context(), 1); err != nil {
		if errors.Is(err, context.Canceled) {
			slog.Info("aborting embeddings request due to client closing the connection")
		} else {
			slog.Error("Failed to acquire semaphore", "error", err)
		}
		return
	}

	s.mu.Lock()
	found := false
	for i, sq := range s.seqs {
		if sq == nil {
			seq.cache, seq.inputs, err = s.cache.LoadCacheSlot(seq.inputs, req.CachePrompt)
			if err != nil {
				s.mu.Unlock()
				http.Error(w, fmt.Sprintf("Failed to load cache: %v", err), http.StatusInternalServerError)
				return
			}
			s.seqs[i] = seq
			s.cond.Signal()
			found = true
			break
		}
	}
	s.mu.Unlock()

	if !found {
		http.Error(w, "could not find an available sequence", http.StatusInternalServerError)
		return
	}

	embedding := <-seq.embedding

	if err := json.NewEncoder(w).Encode(&EmbeddingResponse{
		Embedding: embedding,
	}); err != nil {
		http.Error(w, fmt.Sprintf("failed to encode response: %v", err), http.StatusInternalServerError)
	}
}

type HealthResponse struct {
	Status   string  `json:"status"`
	Progress float32 `json:"progress"`
}

type ServerStatus int

const (
	ServerStatusReady ServerStatus = iota
	ServerStatusLoadingModel
	ServerStatusError
)

func (s ServerStatus) ToString() string {
	switch s {
	case ServerStatusReady:
		return "ok"
	case ServerStatusLoadingModel:
		return "loading model"
	default:
		return "server error"
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(&HealthResponse{
		Status:   s.status.ToString(),
		Progress: s.progress,
	}); err != nil {
		http.Error(w, fmt.Sprintf("failed to encode response: %v", err), http.StatusInternalServerError)
	}
}

type multiLPath []string

func (m *multiLPath) Set(value string) error {
	*m = append(*m, value)
	return nil
}

func (m *multiLPath) String() string {
	return strings.Join(*m, ", ")
}

func (s *Server) loadModel(
	//params llama.ModelParams,
	mpath string,
	//lpath multiLPath,
	kvSize int,
	/*kvCacheType string,
	flashAttention bool,*/
	_ int,
	multiUserCache bool,
) {
	var err error
	s.model, err = model.New(mpath)
	if err != nil {
		panic(err)
	}

	/*	ctxParams := llama.NewContextParams(kvSize, s.batchSize*s.parallel, s.parallel, threads, flashAttention, kvCacheType)
		s.lc, err = llama.NewContextWithModel(s.oldModel, ctxParams)
		if err != nil {
			panic(err)
		}

		if lpath.String() != "" {
			for _, path := range lpath {
				err := s.oldModel.ApplyLoraFromFile(s.lc, path, 1.0, threads)
				if err != nil {
					panic(err)
				}
			}
		}*/

	s.cache, err = NewInputCache(s.model.Backend(), kvSize, s.parallel, multiUserCache)
	if err != nil {
		panic(err)
	}

	s.status = ServerStatusReady
	s.ready.Done()
}

func Execute(args []string) error {
	fs := flag.NewFlagSet("runner", flag.ExitOnError)
	mpath := fs.String("model", "", "Path to model binary file")
	parallel := fs.Int("parallel", 1, "Number of sequences to handle simultaneously")
	batchSize := fs.Int("batch-size", 512, "Batch size")
	_ = fs.Int("n-gpu-layers", 0, "Number of layers to offload to GPU")
	_ = fs.Int("main-gpu", 0, "Main GPU")
	_ = fs.Bool("flash-attn", false, "Enable flash attention")
	kvSize := fs.Int("ctx-size", 2048, "Context (or KV cache) size")
	_ = fs.String("kv-cache-type", "", "quantization type for KV cache (default: f16)")
	port := fs.Int("port", 8080, "Port to expose the server on")
	threads := fs.Int("threads", runtime.NumCPU(), "Number of threads to use during generation")
	verbose := fs.Bool("verbose", false, "verbose output (default: disabled)")
	_ = fs.Bool("no-mmap", false, "do not memory-map model (slower load but may reduce pageouts if not using mlock)")
	_ = fs.Bool("mlock", false, "force system to keep model in RAM rather than swapping or compressing")
	tensorSplit := fs.String("tensor-split", "", "fraction of the model to offload to each GPU, comma-separated list of proportions")
	multiUserCache := fs.Bool("multiuser-cache", false, "optimize input cache algorithm for multiple users")

	var lpaths multiLPath
	fs.Var(&lpaths, "lora", "Path to lora layer file (can be specified multiple times)")

	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Runner usage\n")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	level := slog.LevelInfo
	if *verbose {
		level = slog.LevelDebug
	}
	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level:     level,
		AddSource: true,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.SourceKey {
				source := attr.Value.Any().(*slog.Source)
				source.File = filepath.Base(source.File)
			}
			return attr
		},
	})
	slog.SetDefault(slog.New(handler))
	slog.Info("starting ollama engine")
	//slog.Info("system", "info", llama.PrintSystemInfo(), "threads", *threads)

	server := &Server{
		batchSize: *batchSize,
		parallel:  *parallel,
		seqs:      make([]*Sequence, *parallel),
		seqsSem:   semaphore.NewWeighted(int64(*parallel)),
		status:    ServerStatusLoadingModel,
	}

	var tensorSplitFloats []float32
	if *tensorSplit != "" {
		stringFloats := regexp.MustCompile(",").Split(*tensorSplit, -1)

		tensorSplitFloats = make([]float32, 0, len(stringFloats))
		for _, s := range stringFloats {
			f, _ := strconv.ParseFloat(s, 32)
			tensorSplitFloats = append(tensorSplitFloats, float32(f))
		}
	}

	/*params := llama.ModelParams{
		NumGpuLayers: *nGpuLayers,
		MainGpu:      *mainGpu,
		UseMmap:      !*noMmap && lpaths.String() == "",
		UseMlock:     *mlock,
		TensorSplit:  tensorSplitFloats,
		Progress: func(progress float32) {
			server.progress = progress
		},
	}*/

	server.ready.Add(1)
	go server.loadModel(*mpath, *kvSize, *threads, *multiUserCache)

	server.cond = sync.NewCond(&server.mu)

	ctx, cancel := context.WithCancel(context.Background())
	go server.run(ctx)

	addr := "127.0.0.1:" + strconv.Itoa(*port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Println("Listen error:", err)
		cancel()
		return err
	}
	defer listener.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/embedding", server.embeddings)
	mux.HandleFunc("/completion", server.completion)
	mux.HandleFunc("/health", server.health)

	httpServer := http.Server{
		Handler: mux,
	}

	log.Println("Server listening on", addr)
	if err := httpServer.Serve(listener); err != nil {
		log.Fatal("server error:", err)
		return err
	}

	cancel()
	return nil
}

// // Helper function to get top K logits and convert to log probabilities
// func getTopLogits(logits []float32, k int, model *llama.Model) []api.LogProbs {
// 	if k <= 0 {
// 		return nil
// 	}

// 	// Convert logits to probabilities using softmax
// 	probs := softmax(logits)

// 	// Create slice of index/probability pairs
// 	pairs := make([]struct {
// 		token int
// 		prob  float32
// 	}, len(probs))

// 	for i, p := range probs {
// 		pairs[i] = struct {
// 			token int
// 			prob  float32
// 		}{i, p}
// 	}

// 	// Sort by probability (descending)
// 	sort.Slice(pairs, func(i, j int) bool {
// 		return pairs[i].prob > pairs[j].prob
// 	})

// 	// Take top K
// 	k = min(k, len(pairs))
// 	result := make([]api.LogProbs, k)

// 	for i := 0; i < k; i++ {
// 		result[i] = api.LogProbs{
// 			TopLogprobs: []api.TokenLogprob{
// 				{
// 					Token:   model.TokenToPiece(pairs[i].token),
// 					Logprob: float32(math.Log(float64(pairs[i].prob))),
// 				},
// 			},
// 		}
// 	}

// 	return result
// }

// Helper function to compute softmax
func softmax(logits []float32) []float32 {
	probs := make([]float32, len(logits))

	// Find max for numerical stability
	max := float32(math.Inf(-1))
	for _, l := range logits {
		if l > max {
			max = l
		}
	}

	// Compute exp(x - max) and sum
	sum := float32(0)
	for i, l := range logits {
		ex := float32(math.Exp(float64(l - max)))
		probs[i] = ex
		sum += ex
	}

	// Normalize
	for i := range probs {
		probs[i] /= sum
	}

	return probs
}
