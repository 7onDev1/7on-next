// apps/app/app/(authenticated)/dashboard/components/memories-list-ethical.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Brain, Shield, Lightbulb, AlertCircle, Trash2 } from 'lucide-react';

export default function MemoriesListEthical() {
  const [memories, setMemories] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchMemories();
  }, [filter]);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' 
        ? '/api/memories' 
        : `/api/memories?classification=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setMemories(data.memories || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch memories:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = async (memoryId: number, currentStatus: boolean) => {
    try {
      await fetch('/api/memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoryId, approved: !currentStatus }),
      });
      await fetchMemories();
    } catch (error) {
      console.error('Failed to update approval:', error);
    }
  };

  const deleteMemory = async (memoryId: number) => {
    if (!confirm('Delete this memory?')) return;
    try {
      await fetch(`/api/memories?id=${memoryId}`, { method: 'DELETE' });
      await fetchMemories();
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  };

  const getClassificationIcon = (type: string) => {
    const icons: Record<string, any> = {
      growth_memory: Sparkles,
      challenge_memory: Shield,
      wisdom_moment: Lightbulb,
      needs_support: AlertCircle,
      neutral_interaction: Brain,
    };
    return icons[type] || Brain;
  };

  const getClassificationColor = (type: string) => {
    const colors: Record<string, string> = {
      growth_memory: 'bg-green-100 text-green-800 border-green-300',
      challenge_memory: 'bg-orange-100 text-orange-800 border-orange-300',
      wisdom_moment: 'bg-purple-100 text-purple-800 border-purple-300',
      needs_support: 'bg-red-100 text-red-800 border-red-300',
      neutral_interaction: 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Filter:</span>
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Memories ({total})</SelectItem>
                  <SelectItem value="growth_memory">Growth Memories</SelectItem>
                  <SelectItem value="challenge_memory">Challenge Memories</SelectItem>
                  <SelectItem value="wisdom_moment">Wisdom Moments</SelectItem>
                  <SelectItem value="needs_support">Needs Support</SelectItem>
                  <SelectItem value="neutral_interaction">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={fetchMemories} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Memories List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No memories found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memories.map((memory: any) => {
            const Icon = getClassificationIcon(memory.classification);
            return (
              <Card key={memory.id} className="border-l-4" style={{ borderLeftColor: getClassificationColor(memory.classification).split(' ')[1] }}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-gray-600" />
                        <Badge className={getClassificationColor(memory.classification)}>
                          {memory.classification.replace('_', ' ')}
                        </Badge>
                        {memory.moments && memory.moments.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {memory.moments.map((m: any) => m.type).join(', ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={memory.approved_for_training}
                            onCheckedChange={() => toggleApproval(memory.id, memory.approved_for_training)}
                          />
                          <span className="text-gray-600">Training</span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMemory(memory.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Text */}
                    <p className="text-sm text-gray-800">{memory.text}</p>

                    {/* Ethical Scores */}
                    {memory.ethical_scores && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {Object.entries(memory.ethical_scores).map(([key, value]: [string, any]) => (
                          <div key={key} className="text-xs">
                            <span className="text-gray-500 capitalize">{key.replace('_', ' ')}:</span>
                            <span className="font-medium ml-1">{Math.round(value * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Guidance */}
                    {memory.gentle_guidance && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-sm text-blue-900">💭 {memory.gentle_guidance}</p>
                      </div>
                    )}

                    {/* Reflection Prompt */}
                    {memory.reflection_prompt && (
                      <div className="bg-purple-50 border border-purple-200 rounded p-3">
                        <p className="text-sm text-purple-900">🤔 {memory.reflection_prompt}</p>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Weight: {memory.training_weight}x</span>
                      <span>{new Date(memory.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}