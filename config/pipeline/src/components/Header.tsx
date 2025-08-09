import React from 'react';
import { HeaderProps, AVAILABLE_MODELS } from '../types';

export function Header({ selectedModel, onModelChange, stats, connectionStatus }: HeaderProps) {
  return (
    <header className="bg-pipeline-secondary border-b border-pipeline-primary/30 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-pipeline-primary to-pipeline-accent rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-pipeline-bg font-bold" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 className=\"text-xl font-bold text-pipeline-text\">
              AutoLlama Pipeline Monitor
            </h1>
            <p className=\"text-sm text-pipeline-muted\">
              Real-time RAG processing visualization
            </p>
          </div>
        </div>

        {/* Center Stats */}
        <div className=\"hidden lg:flex items-center gap-6\">
          <div className=\"text-center\">
            <div className=\"text-2xl font-bold text-pipeline-primary\">
              {stats.activeFiles}
            </div>
            <div className=\"text-xs text-pipeline-muted uppercase tracking-wide\">
              Active
            </div>
          </div>
          <div className=\"text-center\">
            <div className=\"text-2xl font-bold text-pipeline-accent\">
              {stats.throughput}
            </div>
            <div className=\"text-xs text-pipeline-muted uppercase tracking-wide\">
              Chunks/min
            </div>
          </div>
          <div className=\"text-center\">
            <div className=\"text-2xl font-bold text-pipeline-text\">
              ${stats.totalCost.toFixed(4)}
            </div>
            <div className=\"text-xs text-pipeline-muted uppercase tracking-wide\">
              Total Cost
            </div>
          </div>
        </div>

        {/* Right Side Controls */}
        <div className=\"flex items-center gap-4\">
          {/* Model Selector */}
          <div className=\"flex items-center gap-2\">
            <label className=\"text-sm text-pipeline-muted hidden sm:block\">
              Model:
            </label>
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className=\"bg-pipeline-bg border border-pipeline-primary/30 rounded-lg px-3 py-1 text-sm text-pipeline-text focus:outline-none focus:ring-2 focus:ring-pipeline-primary/50 focus:border-pipeline-primary\"
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} (${model.costPer1M}/1M)
                </option>
              ))}
            </select>
          </div>

          {/* System Health Indicators */}
          <div className=\"hidden md:flex items-center gap-2\">
            <div className=\"flex items-center gap-1\">
              <div className={`w-2 h-2 rounded-full ${\n                stats.systemHealth.api ? 'bg-status-completed' : 'bg-status-error'\n              }`} />
              <span className=\"text-xs text-pipeline-muted\">API</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <div className={`w-2 h-2 rounded-full ${\n                stats.systemHealth.bm25 ? 'bg-status-completed' : 'bg-status-error'\n              }`} />
              <span className=\"text-xs text-pipeline-muted\">BM25</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <div className={`w-2 h-2 rounded-full ${\n                stats.systemHealth.qdrant ? 'bg-status-completed' : 'bg-status-error'\n              }`} />
              <span className=\"text-xs text-pipeline-muted\">Qdrant</span>
            </div>
            <div className=\"flex items-center gap-1\">
              <div className={`w-2 h-2 rounded-full ${\n                stats.systemHealth.postgres ? 'bg-status-completed' : 'bg-status-error'\n              }`} />
              <span className=\"text-xs text-pipeline-muted\">PG</span>
            </div>
          </div>

          {/* Connection Status */}
          <div className={`px-3 py-1 rounded-lg text-xs font-medium border ${\n            connectionStatus === 'Open'\n              ? 'bg-status-completed/20 border-status-completed text-status-completed'\n              : 'bg-status-error/20 border-status-error text-status-error'\n          }`}>\n            <div className=\"flex items-center gap-1\">\n              <div className={`w-1.5 h-1.5 rounded-full ${\n                connectionStatus === 'Open' ? 'bg-status-completed' : 'bg-status-error'\n              } ${connectionStatus === 'Open' ? '' : 'animate-pulse'}`} />\n              <span className=\"hidden sm:inline\">\n                {connectionStatus === 'Open' ? 'Connected' : 'Disconnected'}\n              </span>\n            </div>\n          </div>\n        </div>\n      </div>\n\n      {/* Mobile Stats Bar */}\n      <div className=\"lg:hidden mt-3 pt-3 border-t border-pipeline-primary/20\">\n        <div className=\"flex justify-around text-center\">\n          <div>\n            <div className=\"text-lg font-bold text-pipeline-primary\">\n              {stats.activeFiles}\n            </div>\n            <div className=\"text-xs text-pipeline-muted\">Active</div>\n          </div>\n          <div>\n            <div className=\"text-lg font-bold text-pipeline-accent\">\n              {stats.throughput}\n            </div>\n            <div className=\"text-xs text-pipeline-muted\">Chunks/min</div>\n          </div>\n          <div>\n            <div className=\"text-lg font-bold text-pipeline-text\">\n              ${stats.totalCost.toFixed(4)}\n            </div>\n            <div className=\"text-xs text-pipeline-muted\">Cost</div>\n          </div>\n          <div>\n            <div className=\"text-lg font-bold text-pipeline-text\">\n              {stats.totalFiles}\n            </div>\n            <div className=\"text-xs text-pipeline-muted\">Total</div>\n          </div>\n        </div>\n      </div>\n    </header>\n  );\n}"