//go:build darwin

package main

import "context"

func handleSquirrelLifecycle([]string) (bool, error) { return false, nil }

func ensureBundledWebView2(context.Context) error { return nil }
