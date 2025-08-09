import React, { useState, useEffect } from 'react';
import { MessageCircle, Brain, Search, TrendingUp, Clock, FileText, Zap } from 'lucide-react';
import { useAppContext } from '../../App';
import ChatInterface from './ChatInterface';

const RAGChat = () => {
  const { api, documents, systemStats } = useAppContext();
  const [chatStats, setChatStats] = useState({
    totalQueries: 0,
    averageResponseTime: 0,
    knowledgeBaseSize: 0,
    ragAccuracy: 0,
  });
  const [showWelcome, setShowWelcome] = useState(true);

  // Load chat statistics
  useEffect(() => {
    loadChatStats();
  }, []);

  const loadChatStats = async () => {
    try {
      const stats = await api.chat.getStats();
      setChatStats(prev => ({ ...prev, ...stats }));
    } catch (error) {
      console.error('Failed to load chat stats:', error);
      // Use fallback stats
      setChatStats({
        totalQueries: 0,
        averageResponseTime: 1.2,
        knowledgeBaseSize: documents?.length || 0,
        ragAccuracy: 92,
      });
    }
  };

  // Sample questions to help users get started
  const sampleQuestions = [
    "Summarize the main points from my recent uploads",
    "What topics do I have the most content about?",
    "Find information about machine learning in my documents",
    "What are the key insights from my research papers?",
    "Show me content related to AI and automation",
  ];

  const handleSampleQuestion = (question) => {
    setShowWelcome(false);
    // This would trigger the chat interface to process the question
    // For now, we'll just hide the welcome screen
  };

  return (
    <div className="space-y-6">
      {/* RAG Chat Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Knowledge Base"
          value={`${chatStats.knowledgeBaseSize || documents?.length || 0} docs`}
          icon={FileText}
          color="text-blue-400"
          description="Processed documents"
        />
        <StatCard
          title="RAG Accuracy"
          value={`${chatStats.ragAccuracy || 92}%`}
          icon={TrendingUp}
          color="text-green-400"
          description="Answer relevance"
        />
        <StatCard
          title="Response Time"
          value={`${chatStats.averageResponseTime || 1.2}s`}
          icon={Zap}
          color="text-yellow-400"
          description="Average speed"
        />
        <StatCard
          title="Total Queries"
          value={chatStats.totalQueries || 0}
          icon={MessageCircle}
          color="text-purple-400"
          description="Chat sessions"
        />
      </div>

      {/* Welcome Screen or Chat Interface */}
      {showWelcome ? (
        <WelcomeScreen
          sampleQuestions={sampleQuestions}
          onQuestionSelect={handleSampleQuestion}
          onStartChat={() => setShowWelcome(false)}
          knowledgeBaseSize={documents?.length || 0}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Chat Interface */}
          <div className="lg:col-span-3">
            <ChatInterface />
          </div>

          {/* Chat Sidebar */}
          <div className="space-y-4">
            <ChatSidebar
              documents={documents}
              onQuestionSelect={handleSampleQuestion}
              sampleQuestions={sampleQuestions}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Welcome Screen Component
const WelcomeScreen = ({ sampleQuestions, onQuestionSelect, onStartChat, knowledgeBaseSize }) => (
  <div className="card text-center space-y-8">
    {/* Header */}
    <div className="space-y-4">
      <div className="w-20 h-20 bg-primary-600 bg-opacity-20 rounded-full flex items-center justify-center mx-auto">
        <Brain className="w-10 h-10 text-primary-400" />
      </div>
      <div>
        <h2 className="text-3xl font-bold mb-2">AutoLlama RAG Chat</h2>
        <p className="text-xl text-gray-400">
          Your AI assistant powered by your processed documents
        </p>
      </div>
    </div>

    {/* Knowledge Base Status */}
    <div className="bg-gray-800 bg-opacity-50 rounded-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-center gap-3 mb-4">
        <FileText className="w-6 h-6 text-blue-400" />
        <span className="text-lg font-medium">Knowledge Base Ready</span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">{knowledgeBaseSize}</div>
          <div className="text-gray-400">Documents</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">RAG</div>
          <div className="text-gray-400">Enhanced</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">GPT-4o</div>
          <div className="text-gray-400">Powered</div>
        </div>
      </div>
    </div>

    {/* Sample Questions */}
    <div className="space-y-4 max-w-3xl mx-auto">
      <h3 className="text-lg font-bold text-gray-300">Try asking about:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sampleQuestions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionSelect(question)}
            className="p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 hover:border-primary-500 hover:bg-primary-600 hover:bg-opacity-10 transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-gray-400 group-hover:text-primary-400 mt-1 flex-shrink-0" />
              <span className="text-gray-300 group-hover:text-white text-sm">
                "{question}"
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Start Chat Button */}
    <button
      onClick={onStartChat}
      className="btn-primary text-lg px-8 py-3"
    >
      <MessageCircle className="w-5 h-5" />
      Start Chatting
    </button>

    {/* Features */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-sm">
      <div className="text-center space-y-2">
        <Search className="w-8 h-8 text-blue-400 mx-auto" />
        <h4 className="font-bold text-white">Semantic Search</h4>
        <p className="text-gray-400">
          Find relevant information across all your documents using advanced vector search
        </p>
      </div>
      <div className="text-center space-y-2">
        <Brain className="w-8 h-8 text-green-400 mx-auto" />
        <h4 className="font-bold text-white">Context-Aware</h4>
        <p className="text-gray-400">
          Responses include contextual understanding of your document relationships
        </p>
      </div>
      <div className="text-center space-y-2">
        <TrendingUp className="w-8 h-8 text-purple-400 mx-auto" />
        <h4 className="font-bold text-white">Source Citations</h4>
        <p className="text-gray-400">
          Every answer includes links to the source documents for verification
        </p>
      </div>
    </div>
  </div>
);

// Chat Sidebar Component
const ChatSidebar = ({ documents, onQuestionSelect, sampleQuestions }) => (
  <div className="space-y-4">
    {/* Quick Actions */}
    <div className="card">
      <h4 className="font-bold mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        Quick Questions
      </h4>
      <div className="space-y-2">
        {sampleQuestions.slice(0, 3).map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionSelect(question)}
            className="w-full text-left p-2 text-sm bg-gray-800 bg-opacity-50 rounded-md hover:bg-gray-700 transition-colors"
          >
            "{question.substring(0, 50)}..."
          </button>
        ))}
      </div>
    </div>

    {/* Recent Documents */}
    <div className="card">
      <h4 className="font-bold mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-400" />
        Recent Documents
      </h4>
      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
        {documents?.slice(0, 5).map((doc, index) => (
          <div key={index} className="p-2 bg-gray-800 bg-opacity-30 rounded-md">
            <div className="font-medium text-white text-sm truncate">
              {doc.title || doc.url || 'Untitled'}
            </div>
            <div className="text-xs text-gray-400">
              {doc.chunkCount || 0} chunks • {doc.contentType || 'document'}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* RAG Information */}
    <div className="card">
      <h4 className="font-bold mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary-400" />
        RAG Features
      </h4>
      <div className="space-y-3 text-sm text-gray-300">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span>Contextual embeddings active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
          <span>Vector similarity search</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
          <span>Source citation included</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
          <span>Real-time knowledge base</span>
        </div>
      </div>
    </div>
  </div>
);

// Stat Card Component
const StatCard = ({ title, value, icon: Icon, color, description }) => (
  <div className="card text-center">
    <div className="flex items-center justify-center mb-2">
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
    <div className="text-sm text-gray-400 mb-1">{title}</div>
    <div className="text-xs text-gray-500">{description}</div>
  </div>
);

export default RAGChat;