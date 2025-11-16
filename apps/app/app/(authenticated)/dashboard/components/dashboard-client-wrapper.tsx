"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@repo/design-system/components/ui/button";
import { Github, Linkedin, Sparkles, Loader2, Check, Database, AlertCircle, Brain } from "lucide-react";
import { useSubscription } from "@repo/auth/hooks/use-subscription";
import type { SubscriptionTier } from "@repo/auth/client";
import { GL } from "@/components/gl";

/* ----------------------------- Icon components ---------------------------- */
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const DiscordIcon = () => (
  <svg className="h-5 w-5" fill="#5865F2" viewBox="0 0 24 24" aria-hidden>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-5 w-5" fill="#1DB954" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg className="h-5 w-5" fill="#0A66C2" viewBox="0 0 24 24" aria-hidden>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

/* ------------------------------- Constants -------------------------------- */
const AUTH0_CONNECT_CLIENT_ID = process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID ?? "";

const CLIENT_IDS = {
  google: AUTH0_CONNECT_CLIENT_ID,
  spotify: AUTH0_CONNECT_CLIENT_ID,
  discord: AUTH0_CONNECT_CLIENT_ID,
  github: AUTH0_CONNECT_CLIENT_ID,
  linkedin: AUTH0_CONNECT_CLIENT_ID,
};

const BASE_SCOPES: Record<string, string> = {
  google: "openid profile email offline_access https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets",
  spotify: "openid user-read-email user-read-private user-read-playback-state user-library-read offline_access",
  discord: "openid identify email guilds offline_access",
  github: "openid user:email repo read:user offline_access",
  linkedin: "openid r_liteprofile r_emailaddress w_member_social offline_access",
};

const TIER_FEATURES: Record<string, string[]> = {
  FREE: ["openrouter", "google", "spotify"],
  PRO: ["google", "spotify", "github", "discord"],
  BUSINESS: ["google", "github", "spotify", "discord", "linkedin"],
};

/* ------------------------------- Utilities -------------------------------- */
const createOAuthState = (userId: string, service: string): string => {
  try {
    return btoa(JSON.stringify({ user_id: userId, service, timestamp: Date.now() }));
  } catch {
    return `${userId}:${service}:${Date.now()}`;
  }
};

const buildAuthorizationUrl = (service: keyof typeof CLIENT_IDS, state: string): string => {
  const redirectUri = process.env.NEXT_PUBLIC_AUTH0_CALLBACK_URL || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth-callback`;
  
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_IDS[service]!,
    redirect_uri: redirectUri,
    scope: BASE_SCOPES[service] || "",
    state,
    audience: `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/api/v2/`,
    connection: service === "google" ? "google-oauth2" : service,
  });

  if (service === "google") {
    params.append("access_type", "offline");
    params.append("prompt", "consent");
  }

  if (service === "spotify") {
    params.append("show_dialog", "true");
  }

  return `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/authorize?${params.toString()}`;
};

const clearUrlParams = (paramsToRemove: string[]): void => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  paramsToRemove.forEach((p) => url.searchParams.delete(p));
  window.history.replaceState({}, "", url.toString());
};

const isFeatureAvailable = (service: string, tier: SubscriptionTier): boolean => {
  return TIER_FEATURES[(tier as string) || "FREE"]?.includes(service) || false;
};

/* ------------------------------- Types ------------------------------------ */
interface Toast {
  id: number;
  message: string;
  visible: boolean;
  showIcon: boolean;
}

interface DashboardClientProps {
  userId: string | null;
  userEmail: string | null;
  initialTier: SubscriptionTier;
}

type ConnectionState = 'connected' | 'disconnected' | 'verifying';

interface ConnectionStatus {
  [key: string]: ConnectionState;
}

interface ConnectionError {
  [key: string]: string | null;
}

interface MemoriesStatus {
  isInitialized: boolean;
  hasCredential: boolean;
  projectReady: boolean;
}

interface DisconnectingState {
  [key: string]: boolean;
}

interface ConfirmDialogState {
  isOpen: boolean;
  service: string | null;
  label: string | null;
}

/* ----------------------- Connection Status Indicator ---------------------- */
const ConnectionStatusIndicator = ({ 
  status, 
  error 
}: { 
  status: ConnectionState;
  error?: string | null;
}) => {
  const isConnected = status === 'connected';
  const isVerifying = status === 'verifying';
  const hasError = !!error;
  
  return (
    <div className="flex items-center justify-center gap-2">
      <div className={`relative w-2.5 h-2.5 rounded-full ${
        isVerifying 
          ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' 
          : isConnected && !hasError
          ? 'bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
          : 'bg-[#f97316] shadow-[0_0_8px_rgba(249,115,22,0.5)]'
      }`}>
        {isVerifying && (
          <div className="absolute inset-0 rounded-full bg-yellow-500 animate-ping opacity-75" />
        )}
        {isConnected && !hasError && (
          <div className="absolute inset-0 rounded-full bg-[#10b981] animate-ping opacity-75" />
        )}
      </div>
      {hasError && (
        <span title={error || undefined}>
          <AlertCircle className="h-3 w-3 text-orange-500" />
        </span>
      )}
    </div>
  );
};

/* ------------------------------- Component -------------------------------- */
export function DashboardClientWrapper({ userId, userEmail, initialTier }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscription = useSubscription();
  const { tier, isFree } = subscription ?? { tier: initialTier, isFree: initialTier === "FREE" };
  const currentTier = (tier || initialTier) as SubscriptionTier;

  const [toast, setToast] = useState<Toast | null>(null);
  const [stats, setStats] = useState<{ activeConnections: number }>({ activeConnections: 0 });
  const [loadingConnect, setLoadingConnect] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});
  const [connectionErrors, setConnectionErrors] = useState<ConnectionError>({});
  const [memoriesStatus, setMemoriesStatus] = useState<MemoriesStatus>({
    isInitialized: false,
    hasCredential: false,
    projectReady: false,
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState<DisconnectingState>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    service: null,
    label: null,
  });

  const verificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasVerifiedRef = useRef<Set<string>>(new Set());

  const services = [
    { service: "google" as const, label: "Google", icon: <GoogleIcon /> },
    { service: "github" as const, label: "GitHub", icon: <Github className="h-5 w-5" /> },
    { service: "spotify" as const, label: "Spotify", icon: <SpotifyIcon /> },
    { service: "discord" as const, label: "Discord", icon: <DiscordIcon /> },
    { service: "linkedin" as const, label: "LinkedIn", icon: <LinkedInIcon /> },
    { service: "openrouter" as const, label: "OpenRouter", icon: <Brain className="h-5 w-5" /> },
  ];

  const availableServices = services.filter((s) => isFeatureAvailable(s.service, currentTier));
  const lockedServices = services.filter((s) => !isFeatureAvailable(s.service, currentTier));

  const showToast = (message: string) => {
    const newToast: Toast = { id: Date.now(), message, visible: true, showIcon: false };
    setToast(newToast);
    setTimeout(() => setToast((prev) => (prev ? { ...prev, showIcon: true } : null)), 180);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, visible: false, showIcon: false } : null));
      setTimeout(() => setToast(null), 500);
    }, 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchConnectionStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/user/social-credentials?userId=${userId}`);
      if (response.ok) {
        const credentials = await response.json();
        const statusMap: ConnectionStatus = {};
        const errorMap: ConnectionError = {};
        
        credentials.forEach((cred: any) => {
          const normalizedProvider = cred.provider.toLowerCase().replace('google-oauth2', 'google');
          
          if (cred.injectedToN8n && !cred.injectionError) {
            statusMap[normalizedProvider] = 'connected';
            errorMap[normalizedProvider] = null;
          } else {
            statusMap[normalizedProvider] = 'disconnected';
            errorMap[normalizedProvider] = cred.injectionError || null;
          }
        });
        
        services.forEach(({ service }) => {
          if (!statusMap[service]) {
            statusMap[service] = 'disconnected';
            errorMap[service] = null;
          }
        });
        
        setConnectionStatus(statusMap);
        setConnectionErrors(errorMap);
      }
    } catch (e) {
      console.error("Error fetching connection status:", e);
    }
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/user/n8n-status?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setStats({ activeConnections: data.injected_providers_count || 0 });
        
        // ✅ FIX: Logic ที่ถูกต้อง
        const projectReady = data.northflank_project_status === 'ready';
        const isInitialized = data.postgres_schema_initialized || false;
        const hasCredential = !!data.n8n_postgres_credential_id;
        
        console.log('📊 Memory Status:', {
          projectReady,
          isInitialized,
          hasCredential,
          projectStatus: data.northflank_project_status
        });
        
        setMemoriesStatus({
          isInitialized,
          hasCredential,
          projectReady,
        });
      }
    } catch (e) {
      console.error("Error fetching stats:", e);
    }
  }, [userId]);

  const handleDisconnect = async (service: string, label: string) => {
    if (!userId) {
      showToast("⚠️ You must be signed in.");
      return;
    }

    setDisconnecting(prev => ({ ...prev, [service]: true }));
    setConfirmDialog({ isOpen: false, service: null, label: null });

    try {
      const response = await fetch(
        `/api/user/social-credentials/disconnect?provider=${service}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (response.ok) {
        showToast(`✅ Successfully disconnected ${label}!`);
        
        setConnectionStatus(prev => ({
          ...prev,
          [service]: 'disconnected'
        }));
        setConnectionErrors(prev => ({
          ...prev,
          [service]: null
        }));

        await fetchStats();
        await fetchConnectionStatus();
      } else {
        showToast(`❌ Failed to disconnect: ${data.message || data.error}`);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      showToast('❌ Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(prev => ({ ...prev, [service]: false }));
    }
  };

  const openDisconnectDialog = (service: string, label: string) => {
    setConfirmDialog({
      isOpen: true,
      service,
      label,
    });
  };

  useEffect(() => {
    fetchStats();
    fetchConnectionStatus();
  }, [fetchStats, fetchConnectionStatus]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStats();
        fetchConnectionStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchStats, fetchConnectionStatus]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const status = searchParams.get("status");
    const error = searchParams.get("error");

    if (connected && status === "success") {
      clearUrlParams(["connected", "status", "timestamp"]);
      
      setConnectionStatus(prev => ({ 
        ...prev, 
        [connected]: 'verifying' 
      }));
      
      showToast(`🔄 Connecting ${connected}...`);
      
      if (!hasVerifiedRef.current.has(connected)) {
        hasVerifiedRef.current.add(connected);
        
        verificationTimerRef.current = setTimeout(async () => {
          console.log(`🔍 Verifying ${connected} connection...`);
          
          try {
            await fetchStats();
            await fetchConnectionStatus();
            
            const response = await fetch(`/api/user/social-credentials?userId=${userId}`);
            if (response.ok) {
              const credentials = await response.json();
              const normalizedProvider = connected.toLowerCase().replace('google-oauth2', 'google');
              const credential = credentials.find((c: any) => 
                c.provider.toLowerCase().replace('google-oauth2', 'google') === normalizedProvider
              );
              
              if (credential?.injectedToN8n && !credential?.injectionError) {
                showToast(`✅ Successfully connected ${connected}!`);
                setConnectionStatus(prev => ({ 
                  ...prev, 
                  [connected]: 'connected' 
                }));
                setConnectionErrors(prev => ({
                  ...prev,
                  [connected]: null
                }));
              } else {
                const errorMsg = credential?.injectionError || 'Connection verification failed';
                showToast(`⚠️ ${connected} connection incomplete: ${errorMsg}`);
                setConnectionStatus(prev => ({ 
                  ...prev, 
                  [connected]: 'disconnected' 
                }));
                setConnectionErrors(prev => ({
                  ...prev,
                  [connected]: errorMsg
                }));
              }
            }
          } catch (err) {
            console.error('Verification error:', err);
            showToast(`⚠️ Failed to verify ${connected} connection`);
            setConnectionStatus(prev => ({ 
              ...prev, 
              [connected]: 'disconnected' 
            }));
          } finally {
            setTimeout(() => {
              hasVerifiedRef.current.delete(connected);
            }, 60000);
          }
        }, 3000);
      }
    } else if (error) {
      showToast(`❌ Connection failed: ${decodeURIComponent(error)}`);
      clearUrlParams(["error", "timestamp"]);
      fetchConnectionStatus();
    }

    return () => {
      if (verificationTimerRef.current) {
        clearTimeout(verificationTimerRef.current);
      }
    };
  }, [searchParams?.toString(), userId, fetchStats, fetchConnectionStatus]);

  const handleConnect = async (service: keyof typeof CLIENT_IDS | 'openrouter', isLocked: boolean) => {
    if (!userId) {
      showToast("⚠️ You must be signed in to connect providers.");
      return;
    }
    if (isLocked && isFree) {
      showToast("🔒 Upgrade required to connect this provider.");
      return;
    }
    
    try {
      setLoadingConnect(service);
      
      if (service === 'openrouter') {
        const { generatePKCEChallenge, buildOpenRouterAuthUrl } = await import('@/lib/openrouter-oauth-client');
        const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
        const authUrl = buildOpenRouterAuthUrl(userId, codeVerifier, codeChallenge);
        window.location.href = authUrl;
        return;
      }
      
      const state = createOAuthState(userId, service);
      const authUrl = buildAuthorizationUrl(service, state);
      window.location.href = authUrl;
    } catch (err) {
      console.error('❌ OAuth Connection Error:', err);
      showToast("⚠️ Failed to start connection. Try again.");
      setLoadingConnect(null);
    }
  };

  const handleMemorySetup = async () => {
    if (!userId) return;
    
    setSetupLoading(true);
    console.log('🚀 Starting memory setup...');
    
    try {
      const response = await fetch('/api/memories/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      
      console.log('Setup response:', data);
      
      if (response.ok) {
        showToast('✅ Database setup completed!');
        
        // Refresh status
        await fetchStats();
        
        // Wait for status to propagate
        setTimeout(async () => {
          await fetchStats();
        }, 2000);
      } else {
        const errorMsg = data.error || data.details || 'Setup failed';
        console.error('Setup failed:', errorMsg);
        showToast(`❌ Setup failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Setup error:', error);
      showToast('❌ Setup failed. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  // ✅ FIX: Logic ที่ถูกต้อง
  const memoryButtonReady = memoriesStatus.isInitialized && memoriesStatus.hasCredential;
  const memoryButtonDisabled = !memoriesStatus.projectReady || setupLoading;

  console.log('🔘 Button State:', {
    memoryButtonReady,
    memoryButtonDisabled,
    memoriesStatus
  });

  return (
    <>
      <GL hovering={hovering} />
      
      <div className="relative w-full min-h-screen p-6 transition-colors duration-500">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="mb-6 flex items-center justify-center">
            <img src="/main-icon.svg" alt="Logo" className="h-12 w-12 object-contain" />
          </div>
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#FF6B5B]/40 to-transparent mt-4 mb-4 rounded-full" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>

            {/* Card 1: Memory Start Button */}
            <div className="relative p-6 rounded-2xl transition-all mt-4 md:mt-10">
              <div className="flex flex-col items-center mb-6">
                {memoryButtonReady ? (
                  <Link href="/dashboard/memories" className="group">
                    <button className="relative w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-600/20 backdrop-blur-sm border border-purple-400/30 shadow-lg shadow-purple-500/20 hover:shadow-2xl hover:shadow-purple-500/40 transition-all duration-300 hover:scale-110 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-[#10b981] shadow-[0_0_12px_rgba(16,185,129,0.6),0_0_20px_rgba(16,185,129,0.3)]">
                        <div className="absolute inset-0 rounded-full bg-[#10b981] animate-ping opacity-75" />
                      </div>
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/30 to-indigo-600/30 blur-md -z-10" />
                    </button>
                    <span className="block text-center mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                      Memory Matrix
                    </span>
                  </Link>
                ) : (
                  <div className="flex flex-col items-center">
                    <button
                      onClick={handleMemorySetup}
                      disabled={memoryButtonDisabled}
                      className="relative w-20 h-20 rounded-full bg-gradient-to-br from-slate-200/30 to-slate-300/30 dark:from-slate-700/30 dark:to-slate-800/30 backdrop-blur-sm border border-slate-300/40 dark:border-slate-600/40 shadow-lg shadow-slate-400/20 dark:shadow-slate-900/40 hover:shadow-2xl hover:shadow-slate-400/40 dark:hover:shadow-slate-900/60 transition-all duration-300 hover:scale-110 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {setupLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      ) : (
                        <div className={`w-5 h-5 rounded-full ${
                          setupLoading 
                            ? 'bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6),0_0_20px_rgba(234,179,8,0.3)]' 
                            : 'bg-[#f97316] shadow-[0_0_12px_rgba(249,115,22,0.6),0_0_20px_rgba(249,115,22,0.3)]'
                        }`}>
                          {setupLoading && (
                            <div className="absolute inset-0 rounded-full bg-yellow-500 animate-ping opacity-75" />
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-300/30 to-slate-400/30 dark:from-slate-600/30 dark:to-slate-700/30 blur-md -z-10" />
                    </button>
                    <span className="block text-center mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {setupLoading 
                        ? 'Setting up...' 
                        : !memoriesStatus.projectReady 
                        ? 'Initializing...' 
                        : 'Start'}
                    </span>
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-slate-200/40 dark:bg-slate-700/40 mb-4" />

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Connections</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.activeConnections}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Plan</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{currentTier}</div>
                </div>
              </div>
            </div>

            {/* Card 2: Available Integrations */}
            <div className="p-6 rounded-2xl bg-white/30 dark:bg-white/10 border border-white/30 dark:border-white/10 shadow-[0_8px_32px_rgba(2,6,23,0.08)] transition-all hover:bg-white/40 dark:hover:bg-white/8">
              <h3 className="text-slate-800 dark:text-slate-200 text-lg font-bold mb-6">Available Integrations</h3>

              <div className="space-y-3">
                {availableServices.map(({ service, label, icon }) => {
                  const loading = loadingConnect === service;
                  const isDisconnecting = disconnecting[service];
                  const status = connectionStatus[service] || 'disconnected';
                  const error = connectionErrors[service];
                  const isConnected = status === 'connected';
                  const isVerifying = status === 'verifying';
                  
                  return (
                    <div
                      key={service}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition border border-slate-200/40 dark:border-slate-700/30 bg-white/30 dark:bg-white/5 backdrop-blur-sm"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/30 dark:bg-white/5">
                          {icon}
                        </div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {isConnected ? `${label} Connected` : isVerifying ? `${label} Verifying...` : `${label}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {loading || isDisconnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-600 dark:text-slate-300" />
                        ) : (
                          <>
                            <ConnectionStatusIndicator status={status} error={error} />
                            
                            {isConnected ? (
                              <button
                                onClick={() => openDisconnectDialog(service, label)}
                                disabled={isDisconnecting}
                                className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Disconnect ${label}`}
                              >
                                Disconnect
                              </button>
                            ) : !isVerifying && (
                              <button
                                onClick={() => {
                                  handleConnect(service, false);
                                  showToast(`Connecting to ${label}...`);
                                }}
                                disabled={loading}
                                className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Connect ${label}`}
                              >
                                Connect
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card 3: Upgrade to Unlock */}
            {lockedServices.length > 0 && (
              <div className="p-6 rounded-2xl bg-white/30 dark:bg-white/10 border border-white/30 dark:border-white/10 shadow-[0_8px_32px_rgba(2,6,23,0.08)] hover:bg-white/40 dark:hover:bg-white/8 transition-all">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-slate-800 dark:text-slate-200 text-lg font-bold">Upgrade to Unlock</h3>
                  {isFree && (
                    <Button asChild size="sm" className="rounded-xl px-4 py-2 border-2 border-[#FF6B5B] bg-transparent text-white hover:opacity-90 transition">
                      <Link href="/pricing" className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Upgrade
                      </Link>
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {lockedServices.map(({ service, label, icon }) => (
                    <div key={service} className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 border border-slate-200/40 dark:border-slate-700/30 bg-white/20 dark:bg-white/3 cursor-not-allowed opacity-60">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg">{icon}</div>
                      <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{label}</span>
                      <svg className="h-4 w-4 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-3">Unlock more integrations and powerful AI features by upgrading your plan.</div>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Dialog */}
          {confirmDialog.isOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                <div className="p-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    Disconnect {confirmDialog.label}?
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                    This will remove all credentials for {confirmDialog.label} from both your account and N8N. 
                    You can reconnect at any time.
                  </p>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDialog({ isOpen: false, service: null, label: null })}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (confirmDialog.service && confirmDialog.label) {
                          handleDisconnect(confirmDialog.service, confirmDialog.label);
                        }
                      }}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {toast && (
            <div
              aria-live="polite"
              className={`fixed z-[9999] left-1/2 -translate-x-1/2 top-[env(safe-area-inset-top,1rem)] transform transition-all duration-300 ease-out
              ${toast.visible ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" : "opacity-0 -translate-y-6 scale-95 pointer-events-none"}`}
            >
              <div className="relative overflow-hidden rounded-2xl bg-white/95 dark:bg-[#0b0d12]/90 backdrop-blur-xl border border-slate-200/40 dark:border-slate-700/40 px-5 py-3 shadow-2xl max-w-[90vw] sm:max-w-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center transition-transform ${toast.showIcon ? "scale-100" : "scale-75"}`}>
                    <Check className="w-4 h-4 text-green-600 dark:text-green-300" />
                  </div>
                  <div className="text-sm text-slate-900 dark:text-slate-100 font-medium break-words">{toast.message}</div>
                </div>

                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-slate-200/30 dark:bg-slate-700/30">
                  <div className="h-full bg-gradient-to-r from-green-400 to-green-600" style={{ animation: toast.visible ? "progressBar 2.5s linear forwards" : "none" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes progressBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </>
  );
}