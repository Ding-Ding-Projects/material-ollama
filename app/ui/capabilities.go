//go:build windows || darwin

package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"runtime"
	"sort"
	"strings"

	ollamacmd "github.com/ollama/ollama/cmd"
	"github.com/ollama/ollama/envconfig"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// CapabilityRegistryVersion is incremented when the JSON shape of the
// GUI-facing capability registry changes.
const CapabilityRegistryVersion = 1

// CommandFlag describes one Cobra flag in a form that the GUI can render and
// validate without scraping terminal help output.
type CommandFlag struct {
	Name         string `json:"name"`
	Shorthand    string `json:"shorthand,omitempty"`
	Type         string `json:"type"`
	DefaultValue string `json:"defaultValue,omitempty"`
	NoOptDefVal  string `json:"noOptDefVal,omitempty"`
	Usage        string `json:"usage,omitempty"`
	Persistent   bool   `json:"persistent"`
}

// CommandCapability is the stable GUI contract for one CLI command. Hidden
// commands are deliberately included so the GUI can expose them in its
// Developer Tools surface instead of silently losing CLI parity.
type CommandCapability struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Use         string        `json:"use"`
	Description string        `json:"description,omitempty"`
	Aliases     []string      `json:"aliases,omitempty"`
	Hidden      bool          `json:"hidden"`
	GUIRoute    string        `json:"guiRoute"`
	Flags       []CommandFlag `json:"flags,omitempty"`
}

// ConfigurationOption describes an environment/configuration input and its
// current effective value. Values are strings because Ollama's CLI accepts
// environment values as strings and performs the type conversion at use time.
type ConfigurationOption struct {
	Name            string `json:"name"`
	Type            string `json:"type"`
	Description     string `json:"description,omitempty"`
	EffectiveValue  string `json:"effectiveValue,omitempty"`
	Source          string `json:"source"`
	Editable        bool   `json:"editable"`
	RestartRequired bool   `json:"restartRequired"`
}

// CapabilityRegistry is generated from the live Cobra tree and envconfig
// catalog. Keeping this data derived from the source definitions means a new
// CLI command or environment variable appears in the GUI inventory
// automatically.
type CapabilityRegistry struct {
	SchemaVersion int                   `json:"schemaVersion"`
	CLIName       string                `json:"cliName"`
	Commands      []CommandCapability   `json:"commands"`
	Configuration []ConfigurationOption `json:"configuration"`
}

func commandGUIRoute(path []string, hidden bool) string {
	name := path[len(path)-1]
	switch name {
	case "run":
		return "chat/run"
	case "list", "ls", "ps":
		return "models"
	case "pull", "push":
		return "models/transfer"
	case "create":
		return "models/create"
	case "show":
		return "models/details"
	case "rm":
		return "models/remove"
	case "cp":
		return "models/copy"
	case "stop":
		return "models/stop"
	case "serve", "start":
		return "service"
	case "signin", "login", "signout", "logout":
		return "account"
	default:
		prefix := "commands"
		if hidden {
			prefix = "developer/commands"
		}
		return prefix + "/" + strings.Join(path, "/")
	}
}

func flagType(flag *pflag.Flag) string {
	if flag == nil || flag.Value == nil {
		return "string"
	}
	valueType := flag.Value.Type()
	switch {
	case strings.Contains(valueType, "bool"):
		return "boolean"
	case strings.Contains(valueType, "int"), strings.Contains(valueType, "uint"), strings.Contains(valueType, "float"):
		return "number"
	case strings.Contains(valueType, "slice"), strings.Contains(valueType, "array"):
		return "list"
	default:
		return "string"
	}
}

func commandFlags(command *cobra.Command) []CommandFlag {
	flags := make([]CommandFlag, 0)
	seen := make(map[string]struct{})
	add := func(flag *pflag.Flag, persistent bool) {
		if flag == nil {
			return
		}
		if _, ok := seen[flag.Name]; ok {
			return
		}
		seen[flag.Name] = struct{}{}
		flags = append(flags, CommandFlag{
			Name:         flag.Name,
			Shorthand:    flag.Shorthand,
			Type:         flagType(flag),
			DefaultValue: flag.DefValue,
			NoOptDefVal:  flag.NoOptDefVal,
			Usage:        flag.Usage,
			Persistent:   persistent,
		})
	}
	command.LocalNonPersistentFlags().VisitAll(func(flag *pflag.Flag) { add(flag, false) })
	command.PersistentFlags().VisitAll(func(flag *pflag.Flag) { add(flag, true) })
	command.InheritedFlags().VisitAll(func(flag *pflag.Flag) { add(flag, true) })
	sort.Slice(flags, func(i, j int) bool { return flags[i].Name < flags[j].Name })
	return flags
}

func commandCapabilities() []CommandCapability {
	root := ollamacmd.NewCLI()
	capabilities := make([]CommandCapability, 0)

	var visit func(*cobra.Command, []string)
	visit = func(command *cobra.Command, parent []string) {
		path := append(append([]string{}, parent...), command.Name())
		if command.Name() != "" {
			id := strings.Join(path, ".")
			capabilities = append(capabilities, CommandCapability{
				ID:          id,
				Name:        command.Name(),
				Use:         command.Use,
				Description: command.Short,
				Aliases:     append([]string{}, command.Aliases...),
				Hidden:      command.Hidden,
				GUIRoute:    commandGUIRoute(path, command.Hidden),
				Flags:       commandFlags(command),
			})
		}
		for _, child := range command.Commands() {
			visit(child, path)
		}
	}
	visit(root, nil)

	sort.Slice(capabilities, func(i, j int) bool { return capabilities[i].ID < capabilities[j].ID })
	return capabilities
}

func configurationValueType(value any) string {
	if value == nil {
		return "string"
	}
	t := reflect.TypeOf(value)
	if t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.Bool:
		return "boolean"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number"
	case reflect.Slice, reflect.Array:
		return "list"
	default:
		return "string"
	}
}

func configurationValueString(value any) string {
	if value == nil {
		return ""
	}
	if stringer, ok := value.(fmt.Stringer); ok {
		return stringer.String()
	}
	if bytes, err := json.Marshal(value); err == nil && string(bytes) != "null" {
		if len(bytes) > 0 && (bytes[0] == '[' || bytes[0] == '{') {
			return string(bytes)
		}
	}
	return fmt.Sprint(value)
}

func configurationSource(name string) string {
	_, envSet := lookupEnvironment(name)
	if name == "OLLAMA_NO_CLOUD" {
		switch envconfig.NoCloudSource() {
		case "both":
			return "environment+config"
		case "config":
			return "config"
		}
	}
	if envSet {
		return "environment"
	}
	return "default"
}

// lookupEnvironment exists to keep Windows' case-insensitive environment
// behavior explicit while remaining deterministic on other platforms.
func lookupEnvironment(name string) (string, bool) {
	if value, ok := os.LookupEnv(name); ok {
		return value, true
	}
	if runtime.GOOS == "windows" {
		for _, item := range os.Environ() {
			key, value, ok := strings.Cut(item, "=")
			if ok && strings.EqualFold(key, name) {
				return value, true
			}
		}
	}
	return "", false
}

func configurationOptions() []ConfigurationOption {
	values := envconfig.AsMap()
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	options := make([]ConfigurationOption, 0, len(keys))
	for _, key := range keys {
		item := values[key]
		options = append(options, ConfigurationOption{
			Name:            key,
			Type:            configurationValueType(item.Value),
			Description:     item.Description,
			EffectiveValue:  configurationValueString(item.Value),
			Source:          configurationSource(key),
			Editable:        true,
			RestartRequired: true,
		})
	}
	return options
}

// BuildCapabilityRegistry derives the GUI inventory from the same command and
// configuration definitions used by the CLI.
func BuildCapabilityRegistry() CapabilityRegistry {
	return CapabilityRegistry{
		SchemaVersion: CapabilityRegistryVersion,
		CLIName:       "ollama",
		Commands:      commandCapabilities(),
		Configuration: configurationOptions(),
	}
}
