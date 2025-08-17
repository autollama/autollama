import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Brain, User, Bot, RefreshCw, Settings, Trash2, Copy, ExternalLink } from 'lucide-react';
import { useAppContext } from '../../App';

const ChatInterface = () => {
  const { api, settings } = useAppContext();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatModel, setChatModel] = useState('gpt-4o-mini');
  const [ragEnabled, setRagEnabled] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive (but only for assistant responses)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  useEffect(() => {
    // Only auto-scroll if the last message was from the assistant (but not on initial load)
    if (messages.length > lastMessageCount && shouldAutoScroll && lastMessageCount > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only scroll if the last message is from assistant
      if (lastMessage && lastMessage.type === 'assistant') {
        scrollToBottom();
      }
    }
    setLastMessageCount(messages.length);
  }, [messages, shouldAutoScroll, lastMessageCount]);

  const scrollToBottom = () => {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Initialize conversation
  useEffect(() => {
    initializeChat();
  }, []);

  // Detect when user manually scrolls to disable auto-scroll
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If user scrolled up from the bottom, disable auto-scroll
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50; // 50px threshold
      setShouldAutoScroll(isAtBottom);
    }
  };

  const initializeChat = () => {
    const welcomeMessage = {
      id: generateId(),
      type: 'assistant',
      content: "👋 Hi! I'm your AutoLlama AI assistant. I can help you search and understand your processed documents using advanced RAG (Retrieval-Augmented Generation). What would you like to know?",
      timestamp: new Date(),
      sources: [],
    };
    setMessages([welcomeMessage]);
    setConversationId(generateId());
  };

  // Send message
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: generateId(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    
    // Focus back on the textarea after sending to maintain user's position
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    try {
      // Send to AutoLlama RAG pipeline
      const response = await api.chat.sendMessage({
        message: inputMessage.trim(),
        model: chatModel,
        ragEnabled,
        conversationId,
        systemContext: "You are AutoLlama's AI assistant. Use the knowledge base to provide helpful, accurate responses with source citations.",
      });

      const assistantMessage = {
        id: generateId(),
        type: 'assistant',
        content: response.content || response.message || 'I apologize, but I encountered an issue processing your request.',
        timestamp: new Date(),
        sources: response.sources || [],
        metadata: response.metadata || {},
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: generateId(),
        type: 'assistant',
        content: `I encountered an error: ${error.message || 'Unable to process your request'}. Please try again or check your connection settings.`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  };

  // Handle send button click
  const handleSendClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage();
  };

  // Clear conversation
  const clearConversation = () => {
    setMessages([]);
    setConversationId(generateId());
    initializeChat();
  };

  // Copy message content
  const copyMessage = (content) => {
    navigator.clipboard.writeText(content);
  };

  // Generate unique ID
  const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh] bg-gray-900 rounded-xl border border-gray-700">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800 bg-opacity-50 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">AutoLlama Chat</h3>
            <p className="text-sm text-gray-400">
              RAG-powered AI assistant • Connected to your knowledge base
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* RAG Toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">RAG:</label>
            <button
              onClick={() => setRagEnabled(!ragEnabled)}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                ragEnabled ? 'bg-primary-600' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute w-4 h-4 bg-white rounded-full top-1 transition-transform ${
                ragEnabled ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Model Selector */}
          <select
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white"
          >
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>

          {/* Clear Chat */}
          <button
            onClick={clearConversation}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="Clear conversation"
          >
            <Trash2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onCopy={() => copyMessage(message.content)}
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-8 h-8 bg-primary-600 bg-opacity-20 rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-400" />
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>AutoLlama is thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700 bg-gray-800 bg-opacity-30 rounded-b-xl">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your processed documents..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={Math.min(Math.max(inputMessage.split('\n').length, 1), 4)}
              disabled={isLoading}
            />
          </div>
          
          <button
            onClick={handleSendClick}
            disabled={!inputMessage.trim() || isLoading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span className={`flex items-center gap-1 ${ragEnabled ? 'text-green-400' : 'text-gray-500'}`}>
            <Brain className="w-3 h-3" />
            {ragEnabled ? 'RAG Active' : 'RAG Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
};

// Individual Chat Message Component
const ChatMessage = ({ message, onCopy }) => {
  const isUser = message.type === 'user';
  const isError = message.isError;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser 
          ? 'bg-blue-600 bg-opacity-20' 
          : isError
            ? 'bg-red-600 bg-opacity-20'
            : 'bg-primary-600 bg-opacity-20'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-blue-400" />
        ) : (
          <Bot className={`w-4 h-4 ${isError ? 'text-red-400' : 'text-primary-400'}`} />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block p-4 rounded-2xl ${
          isUser
            ? 'bg-blue-600 bg-opacity-20 text-blue-100'
            : isError
              ? 'bg-red-600 bg-opacity-20 text-red-100 border border-red-500 border-opacity-30'
              : 'bg-gray-800 bg-opacity-50 text-gray-100'
        }`}>
          {/* Message Text */}
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>

          {/* Sources */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-600 border-opacity-50">
              <div className="text-xs text-gray-400 mb-2">Sources:</div>
              <div className="space-y-1">
                {message.sources.map((source, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <ExternalLink className="w-3 h-3 text-gray-400" />
                    <a 
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline truncate max-w-xs"
                    >
                      {source.title || source.url}
                    </a>
                    {source.score && (
                      <span className="text-gray-500">({Math.round(source.score * 100)}%)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Message Actions */}
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          <span>{message.timestamp.toLocaleTimeString()}</span>
          <button
            onClick={onCopy}
            className="hover:text-gray-300 transition-colors"
            title="Copy message"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;