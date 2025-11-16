// apps/app/app/(authenticated)/dashboard/memories/components/memories-client.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Alert, AlertDescription } from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { 
  Loader2, Database, AlertCircle, RefreshCw, Trash2, Clock, 
  Search, Plus, Sparkles, CheckCircle2, Shield, AlertTriangle 
} from "lucide-react";

interface MemoriesClientProps {
  userId: string;
  isInitialized: boolean;
  hasCredential: boolean;
  setupError: string | null;
  projectStatus: string | null;
}

export function MemoriesClient({ 
  userId, 
  isInitialized, 
  hasCredential, 
  setupError,
  projectStatus 
}: MemoriesClientProps) {
  const [mounted, setMounted] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [searchMode, setSearchMode] = useState<'all' | 'semantic'>('all');
  const [ollamaStatus, setOllamaStatus] = useState<any>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [lastGatingResult, setLastGatingResult] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isInitialized && hasCredential) {
      checkOllamaStatus();
      fetchAllMemories();
    } else if (mounted) {
      setLoading(false);
    }
  }, [mounted, isInitialized, hasCredential]);

  const checkOllamaStatus = async () => {
    try {
      setCheckingOllama(true);
      setError(null);
      
      const response = await fetch('/api/ollama/setup');
      
      if (!response.ok) {
        throw new Error(`Failed to check Ollama: ${response.statusText}`);
      }
      
      const data = await response.json();
      setOllamaStatus(data);
      
      if (data.status === 'unreachable' || data.status === 'offline') {
        setError('Ollama service is not available. Please contact support.');
      }
    } catch (err) {
      console.error('Ollama check error:', err);
      setError('Failed to check Ollama status');
    } finally {
      setCheckingOllama(false);
    }
  };

  const setupOllama = async () => {
    try {
      setCheckingOllama(true);
      setError(null);
      
      const response = await fetch('/api/ollama/setup', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.status === 'pulling') {
        setError('Models are being downloaded. This may take 2-3 minutes. Please wait...');
        setTimeout(checkOllamaStatus, 30000);
      } else if (data.status === 'ready') {
        setOllamaStatus(data);
        setError(null);
      } else {
        setError(data.error || 'Ollama setup failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckingOllama(false);
    }
  };

  const fetchAllMemories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/memories');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch memories');
      }
      
      const data = await response.json();
      setMemories(data.memories || []);
      setSearchMode('all');
    } catch (err) {
      console.error('Error fetching memories:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      fetchAllMemories();
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/memories?query=${encodeURIComponent(searchQuery)}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setMemories(data.memories || []);
        setSearchMode('semantic');
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newMessage.trim()) return;

    setAdding(true);
    setError(null);
    setLastGatingResult(null);
    
    try {
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newMessage,
          metadata: {},
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add memory');
      }

      const data = await response.json();
      
      if (data.success) {
        setLastGatingResult({
          routing: data.routing,
          valence: data.valence,
          scores: data.scores,
          safe_counterfactual: data.safe_counterfactual,
        });
        
        setNewMessage('');
        if (searchMode === 'semantic' && searchQuery) {
          await handleSemanticSearch();
        } else {
          await fetchAllMemories();
        }
      } else {
        throw new Error(data.error || 'Failed to add memory');
      }
    } catch (err) {
      console.error('Add error:', err);
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    
    try {
      setDeleting(memoryId);
      
      const response = await fetch(`/api/memories?id=${memoryId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete memory');
      }
      
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      console.error('Error deleting memory:', err);
      alert('Failed to delete memory');
    } finally {
      setDeleting(null);
    }
  };

  // ✅ FIX: Safe date formatter
  const formatDate = (dateString: string | Date) => {
    if (!mounted) return '';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!projectStatus || projectStatus !== 'ready') {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />
              Project Initialization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Your Northflank project is being initialized...
              </p>
              <p className="text-sm text-muted-foreground">
                Current status: <strong>{projectStatus || 'pending'}</strong>
              </p>
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Database Setup Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {setupError ? (
                <>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{setupError}</AlertDescription>
                  </Alert>
                  <p className="text-sm text-muted-foreground">
                    There was an error during setup. Please try refreshing or contact support.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Click the "Start" button on the dashboard to initialize your semantic memory database.
                </p>
              )}
              <Button onClick={() => window.location.href = '/dashboard'} variant="outline">
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasCredential) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
              N8N Integration Setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">✅ Database schema created successfully!</p>
              <p className="text-muted-foreground">⏳ Waiting for N8N credential creation...</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-purple-500" />
            Semantic Memories
          </h1>
          <p className="text-muted-foreground">AI-powered memory with Ollama + pgvector</p>
        </div>
        <Button onClick={fetchAllMemories} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {ollamaStatus && (
        <Card className={
          ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed
            ? 'border-green-200 dark:border-green-800'
            : 'border-yellow-200 dark:border-yellow-800'
        }>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              Ollama Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Service:</span>
                <span className={`font-semibold ${
                  ollamaStatus.status === 'online' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {ollamaStatus.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">nomic-embed-text:</span>
                <span className={`font-semibold ${
                  ollamaStatus.hasNomicEmbed ? 'text-green-600' : 'text-red-600'
                }`}>
                  {ollamaStatus.hasNomicEmbed ? '✅ Ready' : '❌ Missing'}
                </span>
              </div>
              
              {!ollamaStatus.hasNomicEmbed && (
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The embedding model needs to be downloaded (2-3 minutes)
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={checkOllamaStatus} 
                  disabled={checkingOllama}
                  variant="outline"
                  size="sm"
                >
                  {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check Status'}
                </Button>
                
                {!ollamaStatus.hasNomicEmbed && (
                  <Button 
                    onClick={setupOllama} 
                    disabled={checkingOllama}
                    size="sm"
                  >
                    {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Pull Models
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {lastGatingResult && (
        <Alert className={
          lastGatingResult.routing === 'good' ? 'border-green-200 dark:border-green-800' :
          lastGatingResult.routing === 'bad' ? 'border-red-200 dark:border-red-800' :
          'border-yellow-200 dark:border-yellow-800'
        }>
          <div className="flex items-start gap-3">
            {lastGatingResult.routing === 'good' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {lastGatingResult.routing === 'bad' && <Shield className="h-5 w-5 text-red-600" />}
            {lastGatingResult.routing === 'review' && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
            
            <div className="flex-1">
              <div className="font-semibold">Content Moderation Result</div>
              <div className="text-sm mt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={
                    lastGatingResult.routing === 'good' ? 'default' :
                    lastGatingResult.routing === 'bad' ? 'destructive' :
                    'secondary'
                  }>
                    {lastGatingResult.routing.toUpperCase()} Channel
                  </Badge>
                  <Badge variant="outline">Valence: {lastGatingResult.valence}</Badge>
                  {lastGatingResult.scores && (
                    <Badge variant="outline">
                      Alignment: {(lastGatingResult.scores.alignment * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
                
                {lastGatingResult.safe_counterfactual && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                    <strong>Safe Alternative:</strong> {lastGatingResult.safe_counterfactual}
                  </div>
                )}
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLastGatingResult(null)}
            >
              ×
            </Button>
          </div>
        </Alert>
      )}

      <Card className="border-purple-200 dark:border-purple-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-purple-500" />
            Semantic Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search by meaning..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
              className="flex-1"
              disabled={!ollamaStatus?.hasNomicEmbed || loading}
            />
            <Button 
              onClick={handleSemanticSearch} 
              disabled={loading || !ollamaStatus?.hasNomicEmbed} 
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">🧠 AI understands meaning</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Type something to remember..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
              className="flex-1"
              disabled={!ollamaStatus?.hasNomicEmbed || adding}
            />
            <Button 
              onClick={handleAddMemory} 
              disabled={adding || !newMessage.trim() || !ollamaStatus?.hasNomicEmbed}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">🤖 Converted to vectors + Content Gating</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {searchMode === 'semantic' && searchQuery 
              ? `Results for "${searchQuery}"` 
              : 'All Memories'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-semibold">
                {searchMode === 'semantic' ? 'No matching memories found' : 'No memories yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm break-words font-medium">{memory.content}</p>
                      
                      {memory.metadata?.gating_routing && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge variant={
                            memory.metadata.gating_routing === 'good' ? 'default' :
                            memory.metadata.gating_routing === 'bad' ? 'destructive' :
                            'secondary'
                          } className="text-xs">
                            {memory.metadata.gating_routing}
                          </Badge>
                        </div>
                      )}
                      
                      {memory.score !== undefined && (
                        <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-xs">
                          <Sparkles className="h-3 w-3" />
                          <span className="font-semibold">Similarity:</span>
                          <span>{(memory.score * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(memory.created_at)}</span>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(memory.id)}
                      disabled={deleting === memory.id}
                      className="flex-shrink-0"
                    >
                      {deleting === memory.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500 hover:text-red-600" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}