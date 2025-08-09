import React, { useState } from 'react';
import { FileText, Zap, Brain, TrendingUp, Star, ChevronRight, Eye, ExternalLink } from 'lucide-react';
import { useAppContext } from '../../App';

const SearchResults = ({ query, results, loading, error, mode }) => {
  const [viewMode, setViewMode] = useState('combined'); // 'combined', 'bm25', 'semantic'
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance', 'date', 'title'
  const { handleDocumentSelect, handleChunkSelect } = useAppContext();

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-lg">Searching your digital pasture...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-red-400 p-6 bg-red-900 bg-opacity-20 rounded-lg border border-red-700">
          <h3 className="font-bold text-lg mb-2">Search Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!results || (!results.combined?.length && !results.bm25?.length && !results.semantic?.length)) {
    return (
      <div className="card">
        <div className="text-center py-12 text-gray-500">
          <div className="text-6xl mb-4">🦙</div>
          <h3 className="text-xl font-bold mb-2">No Results Found</h3>
          <p className="text-gray-400">
            No documents match your search for "{query}". Try:
          </p>
          <ul className="text-sm text-gray-500 mt-4 space-y-1">
            <li>• Using different keywords or synonyms</li>
            <li>• Checking your spelling</li>
            <li>• Using broader search terms</li>
            <li>• Switching search modes (BM25 ↔ Semantic)</li>
          </ul>
        </div>
      </div>
    );
  }

  // Get current results based on view mode
  const getCurrentResults = () => {
    switch (viewMode) {
      case 'bm25':
        return results.bm25 || [];
      case 'semantic':
        return results.semantic || [];
      default:
        return results.combined || [];
    }
  };

  const currentResults = getCurrentResults();
  const sortedResults = sortResults(currentResults, sortBy);

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Search Results</h2>
            <p className="text-gray-400">
              Found {currentResults.length} results for "{query}"
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-primary text-sm"
            >
              <option value="relevance">Sort by Relevance</option>
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Title</option>
            </select>
          </div>
        </div>

        {/* View Mode Tabs */}
        {mode === 'hybrid' && (
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
            <ViewModeTab
              id="combined"
              label="Combined"
              icon={TrendingUp}
              count={results.combined?.length || 0}
              active={viewMode === 'combined'}
              onClick={() => setViewMode('combined')}
              color="text-purple-400"
            />
            <ViewModeTab
              id="bm25"
              label="BM25"
              icon={Zap}
              count={results.bm25?.length || 0}
              active={viewMode === 'bm25'}
              onClick={() => setViewMode('bm25')}
              color="text-yellow-400"
            />
            <ViewModeTab
              id="semantic"
              label="Semantic"
              icon={Brain}
              count={results.semantic?.length || 0}
              active={viewMode === 'semantic'}
              onClick={() => setViewMode('semantic')}
              color="text-blue-400"
            />
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {sortedResults.map((result, index) => (
          <SearchResultItem
            key={result.chunk_id || result.id || index}
            result={result}
            query={query}
            rank={index + 1}
            viewMode={viewMode}
            onDocumentSelect={handleDocumentSelect}
            onChunkSelect={handleChunkSelect}
          />
        ))}
      </div>

      {/* Load More Button */}
      {currentResults.length >= 20 && (
        <div className="text-center">
          <button className="btn-secondary">
            Load More Results
          </button>
        </div>
      )}
    </div>
  );
};

// View Mode Tab Component
const ViewModeTab = ({ id, label, icon: Icon, count, active, onClick, color }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
      ${active 
        ? `bg-gray-700 ${color}` 
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
      }
    `}
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
    <span className={`px-2 py-1 text-xs rounded-full font-bold ${
      active ? 'bg-gray-600' : 'bg-gray-700'
    }`}>
      {count}
    </span>
  </button>
);

// Individual Search Result Item
const SearchResultItem = ({ result, query, rank, viewMode, onDocumentSelect, onChunkSelect }) => {
  const [expanded, setExpanded] = useState(false);

  // Get relevance score display
  const getScoreDisplay = () => {
    if (viewMode === 'combined' && result.combinedScore !== undefined) {
      return {
        score: result.combinedScore,
        label: 'Combined Score',
        color: 'text-purple-400',
      };
    } else if (viewMode === 'bm25' && result.bm25Score !== undefined) {
      return {
        score: result.bm25Score,
        label: 'BM25 Score',
        color: 'text-yellow-400',
      };
    } else if (viewMode === 'semantic' && result.semanticScore !== undefined) {
      return {
        score: result.semanticScore,
        label: 'Semantic Score',
        color: 'text-blue-400',
      };
    } else if (result.score !== undefined) {
      return {
        score: result.score,
        label: 'Relevance',
        color: 'text-gray-400',
      };
    }
    return null;
  };

  const scoreDisplay = getScoreDisplay();

  // Highlight search terms in text
  const highlightText = (text, searchQuery) => {
    if (!text || !searchQuery) return text;
    
    const terms = searchQuery.toLowerCase().split(/\s+/);
    let highlightedText = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-300 bg-opacity-30 text-yellow-200 px-1 rounded">$1</mark>');
    });
    
    return highlightedText;
  };

  return (
    <div className="card hover:shadow-lg hover:shadow-primary-500/10 transition-all duration-300">
      <div className="flex items-start gap-4">
        {/* Rank Badge */}
        <div className="flex-shrink-0 w-8 h-8 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
          <span className="text-sm font-bold text-primary-400">#{rank}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-white mb-1 truncate">
                {result.title || result.url || 'Untitled Document'}
              </h3>
              <p className="text-sm text-gray-400 mb-2">
                Chunk {result.chunk_index || 'N/A'} • {result.content_type || 'Unknown Type'}
                {result.technical_level && ` • ${result.technical_level}`}
              </p>
            </div>

            {/* Score and Actions */}
            <div className="flex items-center gap-3 ml-4">
              {scoreDisplay && (
                <div className="text-center">
                  <div className={`text-lg font-bold ${scoreDisplay.color}`}>
                    {scoreDisplay.score.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500">{scoreDisplay.label}</div>
                </div>
              )}
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onChunkSelect(result)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Inspect Chunk"
                >
                  <Eye className="w-4 h-4 text-gray-400" />
                </button>
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Toggle Details"
                >
                  <ChevronRight className={`w-4 h-4 text-gray-400 transform transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Content Preview */}
          <div className="mb-3">
            <p 
              className="text-sm text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ 
                __html: highlightText(
                  result.chunk_text?.substring(0, 300) + (result.chunk_text?.length > 300 ? '...' : '') || 
                  'No content available',
                  query
                )
              }}
            />
          </div>

          {/* Contextual Summary */}
          {result.contextual_summary && (
            <div className="mb-3 p-3 bg-blue-900 bg-opacity-20 border border-blue-700 border-opacity-30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-300">Contextual Summary</span>
              </div>
              <p 
                className="text-sm text-blue-200 italic"
                dangerouslySetInnerHTML={{ 
                  __html: highlightText(result.contextual_summary, query)
                }}
              />
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {result.main_topics?.slice(0, 3).map((topic, i) => (
              <span key={i} className="px-2 py-1 bg-primary-600 bg-opacity-20 text-primary-300 text-xs rounded-full">
                {topic}
              </span>
            ))}
            {result.sentiment && (
              <span className={`px-2 py-1 text-xs rounded-full ${
                result.sentiment === 'positive' ? 'bg-green-600 bg-opacity-20 text-green-300' :
                result.sentiment === 'negative' ? 'bg-red-600 bg-opacity-20 text-red-300' :
                'bg-gray-600 bg-opacity-20 text-gray-300'
              }`}>
                {result.sentiment}
              </span>
            )}
            {result.uses_contextual_embedding && (
              <span className="px-2 py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-xs rounded-full flex items-center gap-1">
                <Brain className="w-3 h-3" />
                Enhanced
              </span>
            )}
          </div>

          {/* Expanded Details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-400">Source:</span>
                  <span className="ml-2">{result.source || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Processing Status:</span>
                  <span className="ml-2">{result.status || 'Completed'}</span>
                </div>
                {result.emotions && result.emotions.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-400">Emotions:</span>
                    <span className="ml-2">{(() => {
                      if (!Array.isArray(result.emotions)) {
                        console.log('SearchResults: emotions is not an array:', typeof result.emotions, result.emotions);
                      }
                      return (Array.isArray(result.emotions) ? result.emotions : []).join(', ');
                    })()}</span>
                  </div>
                )}
                {result.key_concepts && result.key_concepts.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-gray-400">Key Concepts:</span>
                    <span className="ml-2">{(() => {
                      if (!Array.isArray(result.key_concepts)) {
                        console.log('SearchResults: key_concepts is not an array:', typeof result.key_concepts, result.key_concepts);
                      }
                      return (Array.isArray(result.key_concepts) ? result.key_concepts : []).join(', ');
                    })()}</span>
                  </div>
                )}
              </div>
              
              {/* Multi-score Display for Hybrid Results */}
              {viewMode === 'combined' && (result.bm25Score || result.semanticScore) && (
                <div className="flex items-center gap-6 pt-2 border-t border-gray-700">
                  {result.bm25Score !== undefined && (
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <span className="text-yellow-400">BM25: {result.bm25Score.toFixed(3)}</span>
                    </div>
                  )}
                  {result.semanticScore !== undefined && (
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-400">Semantic: {result.semanticScore.toFixed(3)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function to sort results
const sortResults = (results, sortBy) => {
  switch (sortBy) {
    case 'date':
      return [...results].sort((a, b) => 
        new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0)
      );
    case 'title':
      return [...results].sort((a, b) => 
        (a.title || a.url || '').localeCompare(b.title || b.url || '')
      );
    case 'relevance':
    default:
      return [...results].sort((a, b) => 
        (b.combinedScore || b.score || 0) - (a.combinedScore || a.score || 0)
      );
  }
};

export default SearchResults;