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
  Search, Plus, Sparkles, CheckCircle2, Shield, AlertTriangle, Brain, Zap, Eye, TrendingUp 
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
  const [adding, setAdding] = useState(false);
  const [stats, setStats] = useState({ good: 0, bad: 0, review: 0, total: 0 });
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [lastGatingResult, setLastGatingResult] = useState<any>(null);

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
      
      console.log('📋 Fetching all memories...');
      
      const response = await fetch('/api/memories');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch memories');
      }
      
      const data = await response.json();
      console.log('✅ Fetched data:', data);
      
      const memoriesList = data.memories || [];
      setMemories(memoriesList);
      setSearchMode('all');
      
      // Calculate stats from metadata
      const stats = {
        total: memoriesList.length,
        good: memoriesList.filter((m: any) => 
          m.metadata?.classification === 'growth_memory'
        ).length,
        bad: memoriesList.filter((m: any) => 
          m.metadata?.classification === 'challenge_memory'
        ).length,
        review: memoriesList.filter((m: any) => 
          m.metadata?.classification === 'neutral_interaction'
        ).length,
      };
      
      setStats(stats);
      
    } catch (err) {
      console.error('❌ Error fetching memories:', err);
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
      console.log(`🔍 Semantic search: "${searchQuery}"`);
      
      const response = await fetch(`/api/memories?query=${encodeURIComponent(searchQuery)}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }
      
      const data = await response.json();
      
      if (data.memories) {
        setMemories(data.memories);
        setSearchMode('semantic');
        console.log(`✅ Found ${data.memories.length} results`);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('❌ Search error:', err);
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
      console.log('📝 Adding memory:', newMessage);
      
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newMessage,
          metadata: {},
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add memory');
      }

      const data = await response.json();
      console.log('✅ Add memory result:', data);
      
      if (data.success) {
        setLastGatingResult({
          classification: data.classification,
          ethical_scores: data.ethical_scores,
          growth_stage: data.growth_stage,
          moments: data.moments,
          reflection_prompt: data.reflection_prompt,
          gentle_guidance: data.gentle_guidance,
        });
        
        setNewMessage('');
        
        // Refresh list
        await fetchAllMemories();
      } else {
        throw new Error(data.error || 'Failed to add memory');
      }
    } catch (err) {
      console.error('❌ Add error:', err);
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

  const formatDate = (dateString: string | Date) => {
    if (!mounted) return '';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  const getChannelIcon = (classification: string) => {
    switch(classification) {
      case 'growth_memory': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'challenge_memory': return <Shield className="w-4 h-4 text-red-400" />;
      case 'wisdom_moment': return <Brain className="w-4 h-4 text-purple-400" />;
      case 'needs_support': return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      default: return <Brain className="w-4 h-4 text-gray-400" />;
    }
  };

  const getChannelColor = (classification: string) => {
    switch(classification) {
      case 'growth_memory': return 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30';
      case 'challenge_memory': return 'from-red-500/20 to-orange-500/20 border-red-500/30';
      case 'wisdom_moment': return 'from-purple-500/20 to-indigo-500/20 border-purple-500/30';
      case 'needs_support': return 'from-orange-500/20 to-yellow-500/20 border-orange-500/30';
      default: return 'from-gray-500/20 to-slate-500/20 border-gray-500/30';
    }
  };

  const filteredMemories = selectedChannel === 'all'
    ? memories
    : memories.filter(m => m.metadata?.classification === selectedChannel);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!projectStatus || projectStatus !== 'ready') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-amber-500/30 bg-amber-500/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-300">
                <Clock className="h-5 w-5 animate-pulse" />
                Project Initialization
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">Your Northflank project is being initialized...</p>
              <p className="text-sm text-slate-400">
                Current status: <strong className="text-amber-300">{projectStatus || 'pending'}</strong>
              </p>
              <Button onClick={() => window.location.reload()} variant="outline" className="border-amber-500/50">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-blue-500/30 bg-blue-500/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-300">
                <Database className="h-5 w-5" />
                Database Setup Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {setupError ? (
                <>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{setupError}</AlertDescription>
                  </Alert>
                  <p className="text-sm text-slate-400">
                    There was an error during setup. Please try refreshing or contact support.
                  </p>
                </>
              ) : (
                <p className="text-slate-300">
                  Click the "Start" button on the dashboard to initialize your semantic memory database.
                </p>
              )}
              <Button onClick={() => window.location.href = '/dashboard'} variant="outline">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!hasCredential) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-blue-500/30 bg-blue-500/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-300">
                <Clock className="h-5 w-5 animate-pulse" />
                N8N Integration Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">✅ Database schema created successfully!</p>
              <p className="text-slate-300">⏳ Waiting for N8N credential creation...</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/20 p-8 backdrop-blur-xl">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 backdrop-blur-xl border border-purple-500/30">
                  <Sparkles className="w-8 h-8 text-purple-300" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-200 via-indigo-200 to-blue-200 bg-clip-text text-transparent">
                  Neural Memory Matrix
                </h1>
              </div>
              <p className="text-slate-400 ml-16">AI-powered semantic memory with ethical growth</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllMemories}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 transition backdrop-blur-xl"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
              <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">{stats.total} Memories</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, icon: Database, color: 'purple', channel: 'all' },
            { label: 'Growth', value: stats.good, icon: CheckCircle2, color: 'emerald', channel: 'growth_memory' },
            { label: 'Challenge', value: stats.bad, icon: Shield, color: 'red', channel: 'challenge_memory' },
            { label: 'Neutral', value: stats.review, icon: Brain, color: 'gray', channel: 'neutral_interaction' }
          ].map((stat, i) => (
            <button
              key={i}
              onClick={() => setSelectedChannel(stat.channel)}
              className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-xl border transition-all ${
                selectedChannel === stat.channel
                  ? `bg-${stat.color}-500/20 border-${stat.color}-500/50 scale-105`
                  : `bg-slate-900/50 border-slate-700/50 hover:border-${stat.color}-500/30`
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
                <stat.icon className="w-8 h-8 opacity-50" />
              </div>
            </button>
          ))}
        </div>

        {/* Ollama Status */}
        {ollamaStatus && (
          <Card className={`border-2 ${
            ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          } backdrop-blur-xl`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {ollamaStatus.status === 'online' && ollamaStatus.hasNomicEmbed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-400" />
                )}
                <span className="text-slate-200">Ollama Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Service:</span>
                <Badge variant={ollamaStatus.status === 'online' ? 'default' : 'secondary'}>
                  {ollamaStatus.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">nomic-embed-text:</span>
                <Badge variant={ollamaStatus.hasNomicEmbed ? 'default' : 'destructive'}>
                  {ollamaStatus.hasNomicEmbed ? '✅ Ready' : '❌ Missing'}
                </Badge>
              </div>
              
              {!ollamaStatus.hasNomicEmbed && (
                <Alert className="bg-amber-500/10 border-amber-500/30">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm text-slate-300">
                    The embedding model needs to be downloaded (2-3 minutes)
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={checkOllamaStatus} 
                  disabled={checkingOllama}
                  variant="outline"
                  size="sm"
                  className="border-slate-600"
                >
                  {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check Status'}
                </Button>
                
                {!ollamaStatus.hasNomicEmbed && (
                  <Button 
                    onClick={setupOllama} 
                    disabled={checkingOllama}
                    size="sm"
                    className="bg-gradient-to-r from-purple-500 to-indigo-500"
                  >
                    {checkingOllama ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Pull Models
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="border-red-500/30 bg-red-500/5 backdrop-blur-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Gating Result */}
        {lastGatingResult && (
          <div className={`rounded-2xl p-6 backdrop-blur-xl border ${
            lastGatingResult.classification === 'growth_memory' 
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : lastGatingResult.classification === 'challenge_memory'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-purple-500/10 border-purple-500/30'
          }`}>
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-white/5">
                {getChannelIcon(lastGatingResult.classification)}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-2 text-slate-200">Memory Classified</h3>
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <Badge className="bg-white/10 capitalize">
                    {lastGatingResult.classification.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className="border-white/20">
                    Stage: {lastGatingResult.growth_stage}/5
                  </Badge>
                </div>
                
                {lastGatingResult.gentle_guidance && (
                  <div className="mt-3 p-3 bg-blue-500/10 rounded-lg text-sm border border-blue-500/20">
                    <strong className="text-blue-300">💭 Guidance:</strong>{' '}
                    <span className="text-slate-300">{lastGatingResult.gentle_guidance}</span>
                  </div>
                )}

                {lastGatingResult.reflection_prompt && (
                  <div className="mt-3 p-3 bg-purple-500/10 rounded-lg text-sm border border-purple-500/20">
                    <strong className="text-purple-300">🤔 Reflection:</strong>{' '}
                    <span className="text-slate-300">{lastGatingResult.reflection_prompt}</span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setLastGatingResult(null)} 
                className="p-2 hover:bg-white/5 rounded-lg transition text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <Search className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-semibold text-slate-200">Semantic Search</h2>
          </div>
          <div className="flex gap-3">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
              placeholder="Search by meaning, not just keywords..."
              disabled={!ollamaStatus?.hasNomicEmbed || loading}
              className="flex-1 bg-slate-900/50 border-slate-700/50 focus:border-indigo-500/50 text-slate-200 placeholder:text-slate-500"
            />
            <Button
              onClick={handleSemanticSearch}
              disabled={loading || !ollamaStatus?.hasNomicEmbed}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI understands context and intent, not just exact words
          </p>
        </div>

        {/* Add Memory */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <Plus className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-semibold text-slate-200">Add New Memory</h2>
          </div>
          <div className="flex gap-3">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddMemory()}
              placeholder="Type something to remember..."
              disabled={!ollamaStatus?.hasNomicEmbed || adding}
              className="flex-1 bg-slate-900/50 border-slate-700/50 focus:border-purple-500/50 text-slate-200 placeholder:text-slate-500"
            />
            <Button
              onClick={handleAddMemory}
              disabled={adding || !newMessage.trim() || !ollamaStatus?.hasNomicEmbed}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {adding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Add
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Content will be analyzed through ethical growth framework
          </p>
        </div>

        {/* Memories List */}
        <div className="rounded-2xl bg-slate-900/50 border border-slate-700/50 backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-slate-700/50">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-200">
              <Eye className="w-5 h-5" />
              {selectedChannel === 'all' 
                ? 'All Memories' 
                : `${selectedChannel.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Memories`}
            </h2>
          </div>
          
          <div className="divide-y divide-slate-700/50">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No memories in this category yet</p>
              </div>
            ) : (
              filteredMemories.map((memory) => {
                const classification = memory.metadata?.classification || 'neutral_interaction';
                return (
                  <div
                    key={memory.id}
                    className="p-6 hover:bg-slate-800/30 transition group"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${getChannelColor(classification)} backdrop-blur-xl border`}>
                        {getChannelIcon(classification)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-base mb-3 text-slate-200">{memory.text || memory.content}</p>
                        
                        {memory.score !== undefined && (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 mb-3">
                            <TrendingUp className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-semibold text-purple-300">
                              Similarity: {(memory.score * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                        
                        {memory.metadata && (
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            {memory.metadata.classification && (
                              <Badge variant="outline" className="text-xs border-white/20 capitalize">
                                {memory.metadata.classification.replace('_', ' ')}
                              </Badge>
                            )}
                            {memory.metadata.language && (
                              <Badge variant="outline" className="text-xs border-white/20 uppercase">
                                {memory.metadata.language}
                              </Badge>
                            )}
                            {memory.metadata.growth_stage && (
                              <Badge variant="outline" className="text-xs border-white/20">
                                Stage {memory.metadata.growth_stage}/5
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(memory.created_at)}</span>
                          <span className="mx-2">•</span>
                          <span className="font-mono text-xs text-slate-600">
                            ID: {memory.id?.toString().slice(0, 8)}
                          </span>
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(memory.id)}
                        disabled={deleting === memory.id}
                        className="opacity-0 group-hover:opacity-100 transition hover:bg-red-500/10"
                      >
                        {deleting === memory.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-400" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}