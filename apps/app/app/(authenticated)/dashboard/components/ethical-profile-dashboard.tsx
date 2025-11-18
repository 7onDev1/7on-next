// apps/app/app/(authenticated)/dashboard/components/ethical-profile-dashboard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Heart, Brain, Shield, Lightbulb, Star, AlertCircle } from 'lucide-react';

export default function EthicalProfileDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile/ethical');
      const data = await res.json();
      setProfile(data.profile);
      setStats(data.statistics);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const recalculate = async () => {
    setLoading(true);
    try {
      await fetch('/api/profile/ethical', { method: 'POST' });
      await fetchProfile();
    } catch (error) {
      console.error('Recalculation failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-gray-500">No ethical profile found. Start by adding some memories!</p>
        </CardContent>
      </Card>
    );
  }

  const dimensions = [
    { name: 'Self-Awareness', value: profile.self_awareness, icon: Brain, color: 'text-purple-600' },
    { name: 'Emotional Regulation', value: profile.emotional_regulation, icon: Heart, color: 'text-red-600' },
    { name: 'Compassion', value: profile.compassion, icon: Heart, color: 'text-pink-600' },
    { name: 'Integrity', value: profile.integrity, icon: Shield, color: 'text-blue-600' },
    { name: 'Growth Mindset', value: profile.growth_mindset, icon: TrendingUp, color: 'text-green-600' },
    { name: 'Wisdom', value: profile.wisdom, icon: Lightbulb, color: 'text-yellow-600' },
    { name: 'Transcendence', value: profile.transcendence, icon: Star, color: 'text-indigo-600' },
  ];

  const getStageInfo = (stage: number) => {
    const stages: Record<number, { name: string; color: string; desc: string }> = {
      1: { name: 'Pre-conventional', color: 'bg-gray-100 text-gray-800', desc: 'Learning consequences' },
      2: { name: 'Conventional', color: 'bg-blue-100 text-blue-800', desc: 'Following norms' },
      3: { name: 'Post-conventional', color: 'bg-green-100 text-green-800', desc: 'Universal principles' },
      4: { name: 'Integrated', color: 'bg-purple-100 text-purple-800', desc: 'Naturally embodied' },
      5: { name: 'Transcendent', color: 'bg-yellow-100 text-yellow-800', desc: 'Wisdom beyond self' },
    };
    return stages[stage] || stages[2];
  };

  const stageInfo = getStageInfo(profile.growth_stage);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Your Ethical Journey</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {profile.total_interactions} interactions • {profile.breakthrough_moments} breakthroughs
              </p>
            </div>
            <Button onClick={recalculate} variant="outline" size="sm">
              Recalculate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-2xl font-bold">{Math.round(profile.overall_score * 100)}%</span>
              </div>
              <Progress value={profile.overall_score * 100} className="h-2" />
            </div>
            <Badge className={`${stageInfo.color} text-sm px-3 py-1`}>
              Stage {profile.growth_stage}: {stageInfo.name}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-3">{stageInfo.desc}</p>
        </CardContent>
      </Card>

      {/* Ethical Dimensions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Ethical Dimensions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dimensions.map((dim) => (
              <div key={dim.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <dim.icon className={`w-4 h-4 ${dim.color}`} />
                    <span className="text-sm font-medium">{dim.name}</span>
                  </div>
                  <span className="text-sm font-bold">{Math.round(dim.value * 100)}%</span>
                </div>
                <Progress value={dim.value * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Memory Statistics */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Memory Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats).map(([type, data]: [string, any]) => (
                <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getClassificationColor(type)}`} />
                    <span className="font-medium capitalize">{type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-600">
                      {data.approved}/{data.total} approved
                    </span>
                    <Badge variant="outline" className="text-xs">
                      Weight: {data.avg_weight.toFixed(1)}x
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Crisis Warning */}
      {profile.crisis_interventions > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-900">Support Available</p>
                <p className="text-sm text-orange-700 mt-1">
                  You've had {profile.crisis_interventions} moments where support was offered.
                  Remember, seeking help is a sign of strength.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function getClassificationColor(type: string): string {
  const colors: Record<string, string> = {
    growth_memory: 'bg-green-500',
    challenge_memory: 'bg-orange-500',
    wisdom_moment: 'bg-purple-500',
    needs_support: 'bg-red-500',
    neutral_interaction: 'bg-gray-400',
  };
  return colors[type] || 'bg-gray-400';
}