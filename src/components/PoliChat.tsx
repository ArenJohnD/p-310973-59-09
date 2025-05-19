import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Maximize2,
  Minimize2,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { v4 as uuidv4 } from "uuid";

interface Message {
  type: "user" | "bot";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  isActive?: boolean;
}

export function PoliChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch chat sessions when component mounts or user changes
  useEffect(() => {
    if (isOpen && user) {
      fetchChatSessions();
    }
  }, [isOpen, user]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Force rerender when maximized state changes to ensure proper positioning
  useEffect(() => {
    // This empty effect will cause a rerender when isMaximized changes
    // which will update the position styles appropriately
  }, [isMaximized]);

  // Fetch chat sessions from Supabase
  const fetchChatSessions = async () => {
    try {
      if (!user) {
        console.log('PoliChat: No user, skipping fetchChatSessions');
        return;
      }
      
      console.log('PoliChat: Fetching chat sessions for user:', user?.id);
      const { data: sessionsData, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching chat sessions:', error);
        throw error;
      }

      console.log('Retrieved sessions:', sessionsData?.length || 0);
      
      if (!sessionsData || sessionsData.length === 0) {
        setChatSessions([]);
        return;
      }
      
      // For each session, get the last message
      const sessionsWithMessages = await Promise.all(sessionsData.map(async (session) => {
        // Get the last message for this session
        const { data: messagesData } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', session.id)
          .order('timestamp', { ascending: false })
          .limit(1);
          
        const lastMessage = messagesData && messagesData.length > 0 
          ? messagesData[0].content.substring(0, 30) + (messagesData[0].content.length > 30 ? '...' : '') 
          : '';
          
        return {
          id: session.id,
          title: session.title || 'Untitled Chat',
          lastMessage: lastMessage,
          timestamp: new Date(session.created_at || new Date()),
          isActive: session.id === currentSessionId,
        };
      }));

      setChatSessions(sessionsWithMessages);
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load chat history.",
        variant: "destructive",
      });
    }
  };

  // Create a new chat session
  const createNewChatSession = async () => {
    try {
      if (!user) {
        toast({
          title: "Error",
          description: "You need to be logged in to create a chat session.",
          variant: "destructive",
        });
        return;
      }
      
      // Generate a unique ID for the session
      const newSessionId = uuidv4();
      
      // Create a new chat session in the database
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          id: newSessionId,
          title: 'New Chat',
          user_id: user.id,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      // Set as current session and clear messages
      setCurrentSessionId(data.id);
      setMessages([]);
      
      // Add to chat sessions list
      const newSession: ChatSession = {
        id: data.id,
        title: 'New Chat',
        lastMessage: '',
        timestamp: new Date(),
        isActive: true,
      };

      setChatSessions((prev) => {
        const updated = prev.map(s => ({ ...s, isActive: false }));
        return [newSession, ...updated];
      });
      
      console.log('Created new chat session:', data.id);
    } catch (error) {
      console.error('Error creating new chat session:', error);
      toast({
        title: "Error",
        description: "Failed to create a new chat.",
        variant: "destructive",
      });
    }
  };

  // Load messages for a specific chat session
  const loadChatSession = async (sessionId: string) => {
    try {
      setIsLoading(true);

      // Update active session in UI immediately
      setChatSessions(prev => 
        prev.map(session => ({
          ...session,
          isActive: session.id === sessionId
        }))
      );
      
      console.log('Loading chat session:', sessionId);
      
      // Fetch messages for this session
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      console.log('Loaded messages:', data?.length || 0);
      
      // Format messages for the UI
      const formattedMessages: Message[] = data?.map(msg => ({
        type: msg.sender === 'user' ? 'user' : 'bot',
        content: msg.content || "",
        timestamp: new Date(msg.timestamp || new Date())
      })) || [];

      setMessages(formattedMessages);
      setCurrentSessionId(sessionId);
    } catch (error) {
      console.error('Error loading chat session:', error);
      toast({
        title: "Error",
        description: "Failed to load chat messages.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a chat session
  const deleteChatSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent button click
    
    try {
      console.log('Deleting chat session:', sessionId);
      setIsLoading(true);
      
      // Remove from UI immediately for better UX
      setChatSessions(prev => prev.filter(session => session.id !== sessionId));
      
      // Clear current messages if the deleted session was the active one
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId(null);
      }
      
      // Call the Edge Function to delete the session and its messages
      const { data, error } = await supabase.functions.invoke('mistral-chat', {
        body: { 
          action: 'delete_session',
          sessionId: sessionId
        }
      });
      
      if (error) {
        console.error('Error deleting chat session via edge function:', error);
        throw error;
      }

      console.log('Delete response:', data);
      
      toast({
        title: "Success",
        description: "Chat deleted successfully.",
      });
      
      // Refresh chat sessions to ensure UI is up-to-date
      await fetchChatSessions();
      
    } catch (error) {
      console.error('Error deleting chat session:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat. Please try again.",
        variant: "destructive",
      });
      
      // Refresh the chat sessions list to ensure it's up to date despite the error
      fetchChatSessions();
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim()) return;
    
    let sessionId = currentSessionId;
    const userMessage = input.trim();
    setInput("");
    
    try {
      if (!user) {
        toast({
          title: "Error",
          description: "You need to be logged in to send messages.",
          variant: "destructive",
        });
        return;
      }
      
      // If no active session, create one
      if (!sessionId) {
        sessionId = uuidv4();
        setCurrentSessionId(sessionId);
        console.log('Created new session ID on send:', sessionId);
      }
      
      // Add user message to chat
      const newUserMessage = {
        type: "user" as const,
        content: userMessage,
        timestamp: new Date()
      };
      
      setMessages((prev) => [...prev, newUserMessage]);
      setIsLoading(true);

      // Format messages for Mistral API
      const formattedMessages = messages.map(msg => ({
        id: Date.now().toString() + Math.random().toString(),
        text: msg.content,
        sender: msg.type === "user" ? "user" : "bot",
        timestamp: msg.timestamp
      }));
      
      // Add the new user message
      formattedMessages.push({
        id: Date.now().toString(),
        text: userMessage,
        sender: "user",
        timestamp: new Date()
      });

      console.log('Sending message with session:', sessionId);
      
      // Call the Mistral chat edge function
      const response = await supabase.functions.invoke('mistral-chat', {
        body: { 
          messages: formattedMessages,
          context: "",
          sessionId,
          userId: user?.id
        }
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        throw new Error(response.error.message || 'Failed to get a response');
      }

      const { answer } = response.data;
      
      // Add bot response to chat
      const botResponse = {
        type: "bot" as const,
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);

      // Refresh chat sessions to get the latest data
      fetchChatSessions();
      
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(prev => !prev);
  };

  const toggleHistory = () => {
    setIsHistoryOpen(!isHistoryOpen);
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && isMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/5 backdrop-blur-sm z-40"
            onClick={() => setIsMaximized(false)}
          />
        )}
      </AnimatePresence>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ 
              opacity: 0, 
              y: isMaximized ? 0 : 20, 
              scale: 0.95,
              top: isMaximized ? "50%" : "auto",
              left: isMaximized ? "50%" : "auto",
              bottom: isMaximized ? "auto" : "6rem",
              right: isMaximized ? "auto" : "2.5rem",
              transform: isMaximized ? "translate(-50%, -50%)" : "none"
            }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              top: isMaximized ? "50%" : "auto",
              left: isMaximized ? "50%" : "auto", 
              bottom: isMaximized ? "auto" : "6rem",
              right: isMaximized ? "auto" : "2.5rem",
              transform: isMaximized ? "translate(-50%, -50%)" : "none"
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              width: isMaximized ? "calc(100vw - 4rem)" : "380px",
              height: isMaximized ? "calc(100vh - 4rem)" : "600px",
              maxWidth: isMaximized ? "1400px" : "380px",
              maxHeight: isMaximized ? "90vh" : "600px",
              zIndex: 50,
            }}
            className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
          >
            {/* Main content flex */}
            <div className="flex h-full flex-grow min-h-0">
              {/* History Sidebar (Maximized) */}
              {isMaximized && (
                <AnimatePresence>
                  {isHistoryOpen && (
                    <motion.div
                      key="history-sidebar"
                      initial={{ width: 0, opacity: 0, marginRight: 0 }}
                      animate={{ width: 300, opacity: 1, marginRight: isHistoryOpen ? '0' : '-300px' }}
                      exit={{ width: 0, opacity: 0, marginRight: '-300px' }}
                      transition={{ duration: 0.2 }}
                      className="border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0"
                    >
                      <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          <History className="h-5 w-5 text-[rgba(49,159,67,1)]" />
                          Chat History
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-full hover:bg-[rgba(49,159,67,0.1)] text-[rgba(49,159,67,1)]"
                          onClick={createNewChatSession}
                        >
                          <PlusCircle className="h-4 w-4" />
                          <span className="sr-only">New Chat</span>
                        </Button>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-2 space-y-2">
                          {chatSessions.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              No chat history yet
                            </div>
                          ) : (
                            chatSessions.map((session) => (
                              <button
                                key={session.id}
                                onClick={() => loadChatSession(session.id)}
                                className={cn(
                                  "w-full p-3 rounded-lg text-left transition-colors relative border",
                                  session.isActive
                                    ? "bg-[rgba(49,159,67,0.1)] border-[rgba(49,159,67,0.3)]"
                                    : "hover:bg-white border-transparent hover:border-gray-200"
                                )}
                              >
                                <div className="flex flex-col gap-1 pr-7">
                                  <span className="font-medium text-gray-900 truncate">{session.title}</span>
                                  <span className="text-sm text-gray-500 truncate">{session.lastMessage}</span>
                                  <span className="text-xs text-gray-400">{session.timestamp.toLocaleString()}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 absolute top-2 right-2 text-gray-400 hover:text-red-500 hover:bg-transparent"
                                  onClick={(e) => deleteChatSession(session.id, e)}
                                  disabled={isLoading}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/* Main Chat Area */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Chat Header */}
                <div className="bg-gradient-to-r from-[rgba(49,159,67,1)] to-[rgba(39,139,57,1)] p-4 flex items-center justify-between shadow-md flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      onClick={toggleHistory}
                      aria-label={
                        isMaximized
                          ? (isHistoryOpen ? "Hide History Sidebar" : "Show History Sidebar")
                          : (isHistoryOpen ? "Collapse Chat History" : "Expand Chat History")
                      }
                    >
                      {isMaximized ? (
                        isHistoryOpen ? (
                          <ChevronLeft className="h-4 w-4 text-white" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-white" />
                        )
                      ) : (
                        isHistoryOpen ? (
                          <ChevronUp className="h-4 w-4 text-white" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-white" />
                        )
                      )}
                    </Button>

                    <div className="bg-white/10 rounded-lg p-1.5">
                      <MessageCircle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">Chat with Poli</h3>
                      <p className="text-white/80 text-xs">NEU Policy Assistant</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      onClick={toggleMaximize}
                      aria-label={isMaximized ? "Minimize Chat" : "Maximize Chat"}
                    >
                      {isMaximized ? <Minimize2 className="h-4 w-4 text-white" /> : <Maximize2 className="h-4 w-4 text-white" />}
                    </Button>
                  </div>
                </div>

                {/* History Dropdown (Default) */}
                <AnimatePresence>
                  {!isMaximized && isHistoryOpen && (
                    <motion.div
                      key="history-default"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: '180px', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-gray-200 bg-gray-50 overflow-hidden flex-shrink-0"
                      style={{ height: '180px', maxHeight: '180px', flexShrink: 0 }}
                    >
                      <div className="p-2 flex justify-between items-center border-b border-gray-200">
                        <h3 className="text-sm font-medium">Recent Chats</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full hover:bg-[rgba(49,159,67,0.1)] text-[rgba(49,159,67,1)]"
                          onClick={createNewChatSession}
                          disabled={isLoading}
                        >
                          <PlusCircle className="h-4 w-4" />
                          <span className="sr-only">New Chat</span>
                        </Button>
                      </div>
                      <ScrollArea 
                        className="h-[142px]" 
                        type="always" 
                        scrollHideDelay={0}
                        style={{ 
                          '--scrollbar-size': '8px',
                          '--scrollbar-thumb-color': 'rgba(49,159,67,0.3)'
                        } as React.CSSProperties}
                      >
                        <div className="p-2 space-y-2 pr-4">
                          {chatSessions.length === 0 ? (
                            <div className="p-2 text-center text-gray-500 text-xs">
                              No chat history yet
                            </div>
                          ) : (
                            chatSessions.map((session) => (
                              <button
                                key={session.id}
                                onClick={() => loadChatSession(session.id)}
                                className={cn(
                                  "w-full p-2 rounded-md text-left transition-colors border text-xs relative",
                                  session.isActive
                                    ? "bg-[rgba(49,159,67,0.1)] border-[rgba(49,159,67,0.3)]"
                                    : "hover:bg-white border-transparent hover:border-gray-200"
                                )}
                              >
                                <div className="flex flex-col gap-0.5 pr-6">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-gray-900 truncate">{session.title}</span>
                                    <span className="text-gray-400 text-[10px] flex-shrink-0">{session.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <span className="text-gray-500 truncate">{session.lastMessage}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0 absolute top-1 right-1 text-gray-400 hover:text-red-500 hover:bg-transparent"
                                  onClick={(e) => deleteChatSession(session.id, e)}
                                  disabled={isLoading}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Chat Messages */}
                <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
                  <div className="space-y-4 p-4">
                    {messages.length === 0 && !isLoading && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4 py-12">
                        <MessageCircle className="h-12 w-12 text-[rgba(49,159,67,0.3)]" />
                        <div>
                          <p className="font-medium mb-1">Welcome to NEUPoliSeek Chat!</p>
                          <p className="text-sm">Ask me anything about NEU's policies...</p>
                        </div>
                      </div>
                    )}
                    {messages.map((message, index) => (
                      <div key={index} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 shadow-sm ${message.type === "user" ? "bg-[rgba(49,159,67,1)] text-white" : "bg-gray-100 text-gray-900"}`}>
                          <div className="text-sm">{message.content}</div>
                          <div className="text-xs opacity-70 mt-1 text-right">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-3 py-2 inline-block">
                          <Loader2 className="h-4 w-4 animate-spin text-[rgba(49,159,67,1)]" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Chat Input */}
                <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
                  <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about NEU policies..."
                      className="flex-1 text-sm h-9"
                      disabled={isLoading}
                    />
                    <Button 
                      type="submit" 
                      disabled={!input.trim() || isLoading} 
                      className="bg-[rgba(49,159,67,1)] hover:bg-[rgba(39,139,57,1)] h-9 px-3 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Button */}
      <div className="fixed bottom-6 right-10 z-[60]">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { 
            if (isOpen) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
              setIsMaximized(false);
              setIsHistoryOpen(false);
            }
          }}
          className="bg-[rgba(49,159,67,1)] hover:bg-[rgba(39,139,57,1)] text-white rounded-full p-3 shadow-lg flex items-center gap-2 text-sm"
          aria-label={isOpen ? "Close Chat" : "Open Chat"}
        >
          {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
          <span className="font-medium sr-only">{isOpen ? "Close" : "Chat with Poli"}</span>
          {!isOpen && <span className="font-medium">Chat with Poli</span>}
        </motion.button>
      </div>
    </>
  );
}
