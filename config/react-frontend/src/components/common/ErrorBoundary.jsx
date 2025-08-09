import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      const { onClose, fallbackTitle = "Something went wrong" } = this.props;
      
      return (
        <div className="fixed inset-0 bg-black bg-opacity-75 modal-overlay flex items-center justify-center p-4 z-50">
          <div className="modal-content bg-gray-900 text-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 bg-opacity-20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-red-400">{fallbackTitle}</h2>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              )}
            </div>

            {/* Error Message */}
            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                An error occurred while rendering this component. This might be due to a 
                JavaScript error or missing data.
              </p>
              
              {this.state.error && (
                <div className="bg-red-900 bg-opacity-20 border border-red-500 border-opacity-30 rounded-lg p-3 mb-4">
                  <p className="text-red-200 text-sm font-mono">
                    {this.state.error.toString()}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              
              {onClose && (
                <button
                  onClick={onClose}
                  className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-white font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>

            {/* Debug Info (only in development) */}
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-4">
                <summary className="text-gray-400 text-sm cursor-pointer hover:text-white">
                  Debug Information
                </summary>
                <pre className="mt-2 text-xs text-gray-500 bg-gray-800 p-2 rounded overflow-auto max-h-32">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;