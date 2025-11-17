// apps/app/app/(authenticated)/dashboard/lora/components/lora-training-complete.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/design-system/components/ui/card";
import { Button } from "@repo/design-system/components/ui/button";
import { Alert, AlertDescription } from "@repo/design-system/components/ui/alert";
import { Progress } from "@repo/design-system/components/ui/progress";
import { Badge } from "@repo/design-system/components/ui/badge";
import { 
  Loader2, Sparkles, AlertCircle, CheckCircle2, 
  Clock, Zap, Database, TrendingUp, Shield, Brain, RefreshCw,
  ArrowRight, Eye, AlertTriangle
} from "lucide-react";
import Link from "next/link";

interface TrainingStatus {
  status: string;
  currentVersion: string | null;
  lastTrainedAt: string | null;
  error: string | null;
  latestJob: {
    id: string;
    status: string;
    startedAt: string;
  } | null;
  stats: {
    goodChannel: number;
    badChannel: number;
    mclChains: number;
    reviewQueue: number;
    total: number;
  };
}

interface User {
  postgresSchemaInitialized: boolean;
  loraTrainingStatus: string | null;
  loraAdapterVersion: string | null;
  loraLastTrainedAt: Date | null;
  loraTrainingError: string | null;
  goodChannelCount: number;
  badChannelCount: number;
  mclChainCount: number;
}

export function LoraTrainingComplete({ user }: { user: User }) {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchStatus();
    
    const interval = setInterval(() => {
      if (status?.status === 'training') {
        fetchStatus();
        setProgress(prev => Math.min(prev + 2, 95));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [status?.status]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/lora/train');
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        
        if (data.status === 'completed') {
          setProgress(100);
        } else if (data.status === 'training') {
          setProgress(prev => Math.max(prev, 10));
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncCounts = async () => {
    if (!confirm('Sync training data counts from database?\n\nThis will update the displayed counts.')) {
      return;
    }

    try {
      setSyncing(true);
      const response = await fetch('/api/lora/sync-counts', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Counts synced successfully!');
        await fetchStatus();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Failed to sync counts: ${(error as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const startTraining = async () => {
    if (!confirm('Start LoRA fine-tuning?\n\nThis will train a personalized model using your conversation data.\n\nEstimated time: 10-30 minutes')) {
      return;
    }

    try {
      setTraining(true);
      setProgress(5);
      
      const response = await fetch('/api/lora/train', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setProgress(10);
        await fetchStatus();
        alert(`✅ Training started!\n\nVersion: ${data.adapterVersion}\nEstimated time: ${data.estimatedTime}\n\nYou can close this page and come back later.`);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Failed to start training: ${(error as Error).message}`);
    } finally {
      setTraining(false);
    }
  };

  const cancelTraining = async () => {
    if (!confirm('Cancel training?\n\nThis will stop the current training process.')) {
      return;
    }

    try {
      setCancelling(true);
      
      const response = await fetch('/api/lora/train', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Training cancelled successfully!');
        await fetchStatus();
        setProgress(0);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Failed to cancel training: ${(error as Error).message}`);
    } finally {
      setCancelling(false);
    }
  };

  // ✅ FIX: Calculate total from ALL channels
  const totalData = status?.stats?.total || (
    user.goodChannelCount + 
    user.badChannelCount + 
    user.mclChainCount
  );
  
  const canTrain = user.postgresSchemaInitialized && totalData >= 10;
  const isTraining = status?.status === 'training' || user.loraTrainingStatus === 'training';

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'Never';
    if (!mounted) return '...';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/20 p-8 backdrop-blur-xl">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-xl border border-amber-500/30">
                  <Zap className="w-8 h-8 text-amber-300" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-200 via-orange-200 to-red-200 bg-clip-text text-transparent">
                  LoRA Fine-Tuning
                </h1>
              </div>
              <p className="text-slate-400 ml-16">Personalize your AI model with your conversation patterns</p>
            </div>
            <Link href="/dashboard/memories">
              <Button variant="outline" className="border-purple-500/50 hover:bg-purple-500/10">
                <Eye className="w-4 h-4 mr-2" />
                View Memories
              </Button>
            </Link>
          </div>
        </div>

        {/* Database Status Warning */}
        {!user.postgresSchemaInitialized && (
          <Alert variant="destructive" className="border-red-500/30 bg-red-500/5 backdrop-blur-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-slate-200">
              Database setup required. Please set up your database first from the{' '}
              <Link href="/dashboard/memories" className="underline font-semibold">
                Memories page
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}

        {/* Training Status Card */}
        <Card className={`border-2 ${
          isTraining ? 'border-blue-500/50 shadow-lg shadow-blue-500/20' :
          status?.status === 'completed' ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/20' :
          status?.status === 'failed' ? 'border-red-500/50 shadow-lg shadow-red-500/20' :
          'border-slate-700/50'
        } bg-slate-900/50 backdrop-blur-xl`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              {isTraining && <Loader2 className="h-5 w-5 animate-spin text-blue-400" />}
              {status?.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {status?.status === 'failed' && <AlertCircle className="h-5 w-5 text-red-400" />}
              Training Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Status</p>
                  <Badge variant={
                    isTraining ? 'default' :
                    status?.status === 'completed' ? 'default' :
                    status?.status === 'failed' ? 'destructive' :
                    'secondary'
                  } className="text-base capitalize">
                    {status?.status || user.loraTrainingStatus || 'idle'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Version</p>
                  <p className="text-lg font-semibold text-slate-200">
                    {status?.currentVersion || user.loraAdapterVersion || 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Last Trained</p>
                  <p className="text-sm text-slate-300">
                    {formatDate(status?.lastTrainedAt || user.loraLastTrainedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Dataset Size</p>
                  <p className="text-lg font-semibold text-slate-200">
                    {totalData} samples
                  </p>
                </div>
              </div>

              {isTraining && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Training Progress</span>
                    <span className="font-semibold text-slate-200">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-slate-700" />
                  <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-2">
                    <Brain className="w-4 h-4" />
                    Fine-tuning model... This may take 10-30 minutes
                  </p>
                </div>
              )}

              {(status?.error || user.loraTrainingError) && (
                <Alert variant="destructive" className="border-red-500/30 bg-red-500/5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {status?.error || user.loraTrainingError}
                  </AlertDescription>
                </Alert>
              )}

              {status?.status === 'completed' && (
                <Alert className="border-emerald-500/30 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <AlertDescription className="text-emerald-300">
                    ✅ Training completed! Your personalized model is ready to use.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Composition */}
        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-slate-200">
                <Database className="h-5 w-5 text-blue-400" />
                Training Data Composition
              </CardTitle>
              <Button
                onClick={syncCounts}
                disabled={syncing || loading}
                variant="outline"
                size="sm"
                className="border-slate-600"
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Sync</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Good Channel */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl border border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Good Channel</p>
                    <p className="text-xs text-slate-400">High-quality conversations</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-emerald-400">
                    {status?.stats?.goodChannel ?? user.goodChannelCount}
                  </p>
                  <p className="text-xs text-slate-400">samples</p>
                </div>
              </div>

              {/* Bad Channel */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-xl border border-red-500/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <Shield className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Bad Channel (Safety)</p>
                    <p className="text-xs text-slate-400">With safe counterfactuals</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-red-400">
                    {status?.stats?.badChannel ?? user.badChannelCount}
                  </p>
                  <p className="text-xs text-slate-400">samples</p>
                </div>
              </div>

              {/* MCL Chains */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-xl border border-purple-500/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Brain className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">Moral Context Layer</p>
                    <p className="text-xs text-slate-400">Complex reasoning chains</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-purple-400">
                    {status?.stats?.mclChains ?? user.mclChainCount}
                  </p>
                  <p className="text-xs text-slate-400">chains</p>
                </div>
              </div>

              {/* Review Queue */}
              {(status?.stats?.reviewQueue ?? 0) > 0 && (
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 rounded-xl border border-amber-500/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">Review Queue</p>
                      <p className="text-xs text-slate-400">Pending moderation</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-amber-400">
                      {status?.stats?.reviewQueue ?? 0}
                    </p>
                    <p className="text-xs text-slate-400">samples</p>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-200">Total Training Data</p>
                  <p className="text-4xl font-bold text-slate-200">
                    {totalData}
                  </p>
                </div>
                {totalData < 10 && (
                  <Alert className="mt-3 border-amber-500/30 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <AlertDescription className="text-amber-300">
                      ⚠️ Need at least 10 samples to start training (current: {totalData})
                      <Link href="/dashboard/memories" className="block mt-2 underline font-semibold">
                        → Add more memories
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              <Sparkles className="h-5 w-5 text-purple-400" />
              How LoRA Fine-Tuning Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300">
                  1
                </div>
                <div>
                  <p className="font-medium text-slate-200">Data Collection & Gating</p>
                  <p className="text-slate-400">
                    System automatically routes conversations through multi-channel gating to separate good, bad, and morally complex interactions
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300">
                  2
                </div>
                <div>
                  <p className="font-medium text-slate-200">LoRA Training</p>
                  <p className="text-slate-400">
                    Creates a lightweight adapter (~10MB) that personalizes the base model without modifying its core weights
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300">
                  3
                </div>
                <div>
                  <p className="font-medium text-slate-200">Automatic Deployment</p>
                  <p className="text-slate-400">
                    Adapter is automatically loaded into Ollama and ready for personalized AI responses in your workflows
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card className="border-slate-700/50 bg-slate-900/50 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-200">Ready to Train?</p>
                <p className="text-sm text-slate-400">
                  {canTrain 
                    ? 'Your data is ready for training'
                    : totalData < 10
                    ? `Collect ${10 - totalData} more samples to start training`
                    : 'Complete database setup first'
                  }
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  onClick={startTraining}
                  disabled={!canTrain || training || isTraining || loading}
                  size="lg"
                  className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {training || isTraining ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Training...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Start Training
                    </>
                  )}
                </Button>
                
                {isTraining && (
                  <Button
                    onClick={cancelTraining}
                    disabled={cancelling || loading}
                    size="lg"
                    variant="destructive"
                    className="flex-1 sm:flex-none"
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Cancel
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card className="border-dashed border-slate-700/50 bg-slate-900/30 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
              <TrendingUp className="h-4 w-4" />
              Technical Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-slate-400 mb-1">Base Model</p>
                <p className="font-semibold text-slate-200">TinyLlama 1.1B</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">LoRA Rank</p>
                <p className="font-semibold text-slate-200">r=8</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Training Time</p>
                <p className="font-semibold text-slate-200">10-30 min</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Adapter Size</p>
                <p className="font-semibold text-slate-200">~10MB</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Data Mixing</p>
                <p className="font-semibold text-slate-200">Multi-channel</p>
              </div>
              <div>
                <p className="text-slate-400 mb-1">Infrastructure</p>
                <p className="font-semibold text-slate-200">Northflank Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}