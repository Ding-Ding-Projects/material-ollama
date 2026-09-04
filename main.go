package main

//go:generate go run build.go -g -s

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/ollama/ollama/cmd"

	"net/http"
	_ "net/http/pprof"
)

func main() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT)

	go func() {
		<-sigChan
		fmt.Print("\033[?25h")

		os.Exit(0)
	}()

	cobra.CheckErr(cmd.NewCLI().ExecuteContext(context.Background()))
}
