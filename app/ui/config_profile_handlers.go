//go:build windows || darwin

package ui

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

type configProfileRequest struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Values      map[string]string `json:"values"`
}

func (s *Server) configProfileManager() (*ConfigProfileManager, error) {
	s.configProfilesOnce.Do(func() {
		if s.ConfigProfiles != nil {
			return
		}
		s.ConfigProfiles, s.configProfilesErr = NewConfigProfileManager()
	})
	if s.configProfilesErr != nil {
		return nil, s.configProfilesErr
	}
	if s.ConfigProfiles == nil {
		return nil, errors.New("configuration profile manager is unavailable")
	}
	return s.ConfigProfiles, nil
}

func (s *Server) capabilities(w http.ResponseWriter, r *http.Request) error {
	registry := BuildCapabilityRegistry()
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(registry)
}

func (s *Server) getConfigProfiles(w http.ResponseWriter, r *http.Request) error {
	manager, err := s.configProfileManager()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(manager.Snapshot())
}

func decodeConfigProfileRequest(r *http.Request) (configProfileRequest, error) {
	var request configProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return configProfileRequest{}, fmt.Errorf("invalid configuration profile request: %w", err)
	}
	return request, nil
}

func (s *Server) createConfigProfile(w http.ResponseWriter, r *http.Request) error {
	manager, err := s.configProfileManager()
	if err != nil {
		return err
	}
	request, err := decodeConfigProfileRequest(r)
	if err != nil {
		return err
	}
	profile, err := manager.Create(request.Name, request.Description, request.Values)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	return json.NewEncoder(w).Encode(profile)
}

func (s *Server) updateConfigProfile(w http.ResponseWriter, r *http.Request) error {
	manager, err := s.configProfileManager()
	if err != nil {
		return err
	}
	request, err := decodeConfigProfileRequest(r)
	if err != nil {
		return err
	}
	profile, err := manager.Update(r.PathValue("id"), request.Name, request.Description, request.Values)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(profile)
}

func (s *Server) deleteConfigProfile(w http.ResponseWriter, r *http.Request) error {
	manager, err := s.configProfileManager()
	if err != nil {
		return err
	}
	profileID := r.PathValue("id")
	wasActive := manager.Snapshot().ActiveProfile == profileID
	if _, err := manager.Delete(profileID); err != nil {
		return err
	}
	if wasActive && s.Restart != nil {
		s.Restart()
	}
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{
		"deleted":          true,
		"restartRequested": wasActive,
	})
}

func (s *Server) applyConfigProfile(w http.ResponseWriter, r *http.Request) error {
	manager, err := s.configProfileManager()
	if err != nil {
		return err
	}
	result, err := manager.Apply(r.PathValue("id"))
	if err != nil {
		return err
	}
	if s.Restart != nil {
		s.Restart()
	}
	result.RestartRequested = s.Restart != nil
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(result)
}
