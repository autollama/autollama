import { useState, useEffect, useCallback } from 'react';
import settingsManager from '../utils/settingsManager';

export const useSettings = () => {
  const [settings, setSettings] = useState(settingsManager.loadSettings());
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({
    openai: false,
    qdrant: false,
  });

  // Load fresh settings from storage
  const reloadSettings = useCallback(() => {
    setSettings(settingsManager.loadSettings());
  }, []);

  // Update a specific setting
  const updateSetting = useCallback((category, key, value) => {
    const success = settingsManager.updateSetting(category, key, value);
    if (success) {
      reloadSettings();
    }
    return success;
  }, [reloadSettings]);

  // Update multiple settings in a category
  const updateCategory = useCallback((category, updates) => {
    const success = settingsManager.updateCategory(category, updates);
    if (success) {
      reloadSettings();
    }
    return success;
  }, [reloadSettings]);

  // Reset all settings to defaults
  const resetSettings = useCallback(() => {
    const success = settingsManager.resetSettings();
    if (success) {
      reloadSettings();
    }
    return success;
  }, [reloadSettings]);

  // Test connections
  const testConnections = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await settingsManager.validateConnections(settings);
      setConnectionStatus(results);
      return results;
    } catch (error) {
      console.error('Connection test failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [settings]);

  // Export settings
  const exportSettings = useCallback(() => {
    settingsManager.exportSettings();
  }, []);

  // Import settings
  const importSettings = useCallback(async (file) => {
    setIsLoading(true);
    try {
      const success = await settingsManager.importSettings(file);
      if (success) {
        reloadSettings();
      }
      return success;
    } catch (error) {
      console.error('Settings import failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [reloadSettings]);

  // Auto-test connections on app startup and when connection settings change
  useEffect(() => {
    // Test connections on startup only if not prone to CORS issues
    if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
      testConnections();
    } else {
      console.log('Skipping automatic connection tests to avoid CORS errors');
    }
  }, [testConnections]);

  // Set up periodic validation every 5 minutes for real-time status (reduced to avoid CORS spam)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only test if not in a browser environment or if explicitly enabled
      if (typeof window === 'undefined' || window.location.hostname === 'localhost') {
        testConnections();
      }
    }, 300000); // 5 minutes (300000ms) - reduced from 30 seconds to avoid CORS errors

    return () => clearInterval(interval);
  }, [testConnections]);

  return {
    settings,
    isLoading,
    connectionStatus,
    updateSetting,
    updateCategory,
    resetSettings,
    testConnections,
    exportSettings,
    importSettings,
    reloadSettings,
  };
};