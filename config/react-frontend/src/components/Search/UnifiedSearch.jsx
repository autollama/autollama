import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Filter, Sliders, Zap, Brain, X, Clock, TrendingUp } from 'lucide-react';
import { useAppContext } from '../../App';
import { useHybridSearch } from '../../hooks/useAPI';
import SearchResults from './SearchResults';

const UnifiedSearch = () => {
  const { settings, handleSearchQueryChange, searchQuery } = useAppContext();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('hybrid'); // 'hybrid', 'bm25', 'semantic'
  const [filters, setFilters] = useState({
    contentType: '',
    technicalLevel: '',
    sentiment: '',
    dateRange: '',
    hasContextual: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState({ combined: [], bm25: [], semantic: [] });
  const [searchError, setSearchError] = useState(null);
  
  const hybridSearch = useHybridSearch();
  const searchTimeoutRef = useRef(null);

  // Synchronize local query with global searchQuery from context
  useEffect(() => {
    if (searchQuery && searchQuery !== query) {
      setQuery(searchQuery);
      // Trigger search if we have a query from context
      if (searchQuery.trim()) {
        // Use direct search call instead of debouncedSearch to avoid dependency issues
        performSearch(searchQuery, filters, searchMode);
      }
    }
  }, [searchQuery]);

  // Load search history from localStorage
  useEffect(() => {
    if (settings.search.enableSearchHistory) {
      const history = JSON.parse(localStorage.getItem('autollama-search-history') || '[]');
      setSearchHistory(history.slice(0, 10)); // Keep only last 10
    }
  }, [settings.search.enableSearchHistory]);

  // Debounced search function
  const debouncedSearch = useCallback(
    (searchQuery, searchFilters, mode) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(async () => {
        if (searchQuery.trim().length < 2) return;

        setIsSearching(true);
        try {
          await performSearch(searchQuery, searchFilters, mode);
          
          // Add to search history
          if (settings.search.enableSearchHistory) {
            const newHistory = [
              { query: searchQuery, timestamp: new Date().toISOString(), mode },
              ...searchHistory.filter(h => h.query !== searchQuery)
            ].slice(0, 10);
            
            setSearchHistory(newHistory);
            localStorage.setItem('autollama-search-history', JSON.stringify(newHistory));
          }
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [searchHistory, settings.search.enableSearchHistory]
  );

  // Perform the actual search
  const performSearch = async (searchQuery, searchFilters, mode) => {
    try {
      setIsSearching(true);
      
      // Use the working /api/search endpoint directly
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=${settings.search.maxSearchResults || 50}`);
      const results = await response.json();
      
      // Transform results to match expected format
      const transformedResults = {
        combined: results || [],
        bm25: mode === 'bm25' ? results || [] : [],
        semantic: mode === 'semantic' ? results || [] : [],
      };
      
      // Update local search results state
      setSearchResults(transformedResults);
      setSearchError(null);
      
      // Update parent component with search query
      handleSearchQueryChange(searchQuery);
      
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError(error.message);
      setSearchResults({ combined: [], bm25: [], semantic: [] });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search input change
  const handleQueryChange = (newQuery) => {
    setQuery(newQuery);
    // Update global search query to keep header search in sync
    handleSearchQueryChange(newQuery);
    if (newQuery.trim()) {
      debouncedSearch(newQuery, filters, searchMode);
    }
  };

  // Handle search mode change
  const handleModeChange = (mode) => {
    setSearchMode(mode);
    if (query.trim()) {
      debouncedSearch(query, filters, mode);
    }
  };

  // Handle filter change
  const handleFilterChange = (filterKey, value) => {
    const newFilters = { ...filters, [filterKey]: value };
    setFilters(newFilters);
    if (query.trim()) {
      debouncedSearch(query, newFilters, searchMode);
    }
  };

  // Clear search
  const clearSearch = () => {
    setQuery('');
    // Clear global search query to keep header search in sync
    handleSearchQueryChange('');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  // Search mode configurations
  const searchModes = [
    {
      id: 'hybrid',
      label: 'Hybrid',
      icon: TrendingUp,
      description: 'Best of both lexical and semantic search',
      color: 'text-purple-400',
      bgColor: 'bg-purple-600',
    },
    {
      id: 'bm25',
      label: 'BM25',
      icon: Zap,
      description: 'Fast lexical search for exact matches',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-600',
    },
    {
      id: 'semantic',
      label: 'Semantic',
      icon: Brain,
      description: 'AI-powered contextual understanding',
      color: 'text-blue-400',
      bgColor: 'bg-blue-600',
    },
  ];

  const currentMode = searchModes.find(mode => mode.id === searchMode);

  return (
    <div className="space-y-4">
      {/* Main Search Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search across all your documents..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="input-primary pl-12 pr-20 text-lg h-14"
            autoComplete="off"
          />
          
          {/* Clear Button */}
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-12 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-700 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          
          {/* Search Indicator */}
          <div className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${currentMode.color}`}>
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <currentMode.icon className="w-5 h-5" />
            )}
          </div>
        </div>

        {/* Search Mode Selector */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Search Mode:</span>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {searchModes.map((mode) => {
                const Icon = mode.icon;
                const isActive = searchMode === mode.id;
                
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleModeChange(mode.id)}
                    className={`
                      flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-all duration-200
                      ${isActive 
                        ? `${mode.bgColor} bg-opacity-20 ${mode.color}` 
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      }
                    `}
                    title={mode.description}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm transition-colors ${
              showFilters ? 'bg-primary-600 bg-opacity-20 text-primary-400' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {Object.values(filters).filter(Boolean).length > 0 && (
              <span className="px-2 py-1 bg-primary-600 rounded-full text-xs font-bold">
                {Object.values(filters).filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search Filters */}
      {showFilters && (
        <SearchFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={() => setFilters({
            contentType: '',
            technicalLevel: '',
            sentiment: '',
            dateRange: '',
            hasContextual: null,
          })}
        />
      )}

      {/* Search History */}
      {searchHistory.length > 0 && !query && (
        <SearchHistory
          history={searchHistory}
          onSelectQuery={(historyQuery) => {
            setQuery(historyQuery.query);
            setSearchMode(historyQuery.mode);
            handleQueryChange(historyQuery.query);
          }}
          onClearHistory={() => {
            setSearchHistory([]);
            localStorage.removeItem('autollama-search-history');
          }}
        />
      )}

      {/* Search Results */}
      {query && (
        <SearchResults
          query={query}
          results={searchResults}
          loading={isSearching}
          error={searchError}
          mode={searchMode}
        />
      )}
    </div>
  );
};

// Search Filters Component
const SearchFilters = ({ filters, onFilterChange, onClearFilters }) => (
  <div className="card">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-bold flex items-center gap-2">
        <Sliders className="w-4 h-4" />
        Search Filters
      </h3>
      <button
        onClick={onClearFilters}
        className="text-sm text-gray-400 hover:text-white"
      >
        Clear All
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Content Type</label>
        <select
          value={filters.contentType}
          onChange={(e) => onFilterChange('contentType', e.target.value)}
          className="input-primary"
        >
          <option value="">All Types</option>
          <option value="article">Articles</option>
          <option value="academic">Academic Papers</option>
          <option value="book">Books</option>
          <option value="reference">Reference</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Technical Level</label>
        <select
          value={filters.technicalLevel}
          onChange={(e) => onFilterChange('technicalLevel', e.target.value)}
          className="input-primary"
        >
          <option value="">All Levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="PhD_required">PhD Required</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Sentiment</label>
        <select
          value={filters.sentiment}
          onChange={(e) => onFilterChange('sentiment', e.target.value)}
          className="input-primary"
        >
          <option value="">All Sentiments</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Has Contextual</label>
        <select
          value={filters.hasContextual === null ? '' : filters.hasContextual.toString()}
          onChange={(e) => onFilterChange('hasContextual', e.target.value === '' ? null : e.target.value === 'true')}
          className="input-primary"
        >
          <option value="">All Documents</option>
          <option value="true">Enhanced with Context</option>
          <option value="false">Standard Processing</option>
        </select>
      </div>
    </div>
  </div>
);

// Search History Component
const SearchHistory = ({ history, onSelectQuery, onClearHistory }) => (
  <div className="card">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-bold flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Recent Searches
      </h3>
      <button
        onClick={onClearHistory}
        className="text-sm text-gray-400 hover:text-white"
      >
        Clear History
      </button>
    </div>

    <div className="flex flex-wrap gap-2">
      {history.map((item, index) => (
        <button
          key={index}
          onClick={() => onSelectQuery(item)}
          className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          <span>{item.query}</span>
          <span className="text-xs text-gray-400">({item.mode})</span>
        </button>
      ))}
    </div>
  </div>
);


export default UnifiedSearch;