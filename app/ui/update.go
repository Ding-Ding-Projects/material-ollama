//go:build windows || darwin

package ui

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/ollama/ollama/app/updater"
)

func (s *Server) updateContext() context.Context {
	if s.UpdateContext != nil {
		return s.UpdateContext
	}
	return context.Background()
}
func (s *Server) writeUpdate(w http.ResponseWriter, status updater.UpdateStatus, code int) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	return json.NewEncoder(w).Encode(status)
}
func (s *Server) updateFailure(w http.ResponseWriter, code string) error {
	st := updater.UpdateStatus{State: updater.UpdateError, UnsignedWarning: true}
	if s.Updater != nil {
		st = s.Updater.Status()
	}
	st.ErrorCode = code
	st.Error = "The update action is unavailable. Save drafts, stop active work, and retry."
	return s.writeUpdate(w, st, http.StatusConflict)
}
func (s *Server) updateStatus(w http.ResponseWriter, _ *http.Request) error {
	if s.Updater == nil {
		return s.updateFailure(w, "unavailable")
	}
	return s.writeUpdate(w, s.Updater.Status(), 200)
}
func (s *Server) updateCheck(w http.ResponseWriter, _ *http.Request) error {
	if s.Updater == nil {
		return s.updateFailure(w, "unavailable")
	}
	st, e := s.Updater.StartCheck(s.updateContext())
	if e != nil {
		return s.updateFailure(w, "busy")
	}
	return s.writeUpdate(w, st, http.StatusAccepted)
}
func (s *Server) updateDownload(w http.ResponseWriter, _ *http.Request) error {
	if s.Updater == nil {
		return s.updateFailure(w, "unavailable")
	}
	st, e := s.Updater.StartDownload(s.updateContext())
	if e != nil {
		return s.updateFailure(w, "not-ready")
	}
	return s.writeUpdate(w, st, http.StatusAccepted)
}
func (s *Server) updateCancel(w http.ResponseWriter, _ *http.Request) error {
	if s.Updater == nil {
		return s.updateFailure(w, "unavailable")
	}
	return s.writeUpdate(w, s.Updater.CancelUpdate(), 200)
}
func (s *Server) updateLater(w http.ResponseWriter, _ *http.Request) error {
	if s.Updater == nil {
		return s.updateFailure(w, "unavailable")
	}
	return s.writeUpdate(w, s.Updater.DeferUpdate(), 200)
}
func (s *Server) updateRestart(w http.ResponseWriter, r *http.Request) error {
	if s.Updater == nil || s.QuitForUpdate == nil {
		return s.updateFailure(w, "unavailable")
	}
	var req struct {
		Confirmed   bool  `json:"confirmed"`
		UnsavedWork *bool `json:"unsavedWork"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	d.DisallowUnknownFields()
	var extra any
	if d.Decode(&req) != nil || d.Decode(&extra) != io.EOF || !req.Confirmed || req.UnsavedWork == nil {
		return s.updateFailure(w, "invalid-request")
	}
	if *req.UnsavedWork || !s.updateWork.TryLock() {
		return s.updateFailure(w, "unsaved-work")
	}
	restarting := false
	defer func() {
		if !restarting {
			s.updateWork.Unlock()
		}
	}()
	st, e := s.Updater.InstallUpdate(s.updateContext(), false)
	if e != nil {
		return s.updateFailure(w, "install")
	}
	restarting = true
	// Once the restart child has captured this process, a disconnected
	// renderer must not leave it waiting forever for an exit.
	time.AfterFunc(200*time.Millisecond, s.QuitForUpdate)
	if e = s.writeUpdate(w, st, 200); e != nil {
		return e
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	// Installation has finished and the Squirrel child is waiting for this
	// process. Shutdown uses the normal tray/server path, never a forced kill.
	return nil
}
