import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signInWithEmail, signUpWithEmail, signOut as supabaseSignOut, getCurrentUser } from '../lib/supabase';
import { clearCache } from '../lib/supabase';
import { clearAllStorage, loginRateLimiter, sanitizeInput, isValidEmail, logSecurityEvent, sanitizeErrorMessage, validateInput } from '../utils/security';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'worker';
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionChecked: boolean;
  sessionTimeRemaining: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'manager' | 'worker') => Promise<void>;
  signOut: () => Promise<void>;
  extendSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState(0);
  const [sessionTimer, setSessionTimer] = useState<NodeJS.Timeout | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Track if session warning has been shown to prevent spam
  const [sessionWarningShown, setSessionWarningShown] = useState(false);

  // Security: Complete auth data clearing on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogout = urlParams.get('logout') === 'true';
    const forceParam = urlParams.get('force') === 'true';
    
    if (forceLogout || forceParam) {
      // Security: Force complete logout
      performCompleteLogout();
      return;
    }

    // Only clear cache, don't clear all storage on mount
    clearCache();
    performInitialAuthCheck();
  }, []);

  // Security: Initial authentication check
  const performInitialAuthCheck = async () => {
    try {
      setIsInitializing(true);
      setLoading(true);
      await checkAuthState();
    } finally {
      setSessionChecked(true);
      setIsInitializing(false);
      setLoading(false);
    }
  };

  // Security: Session timeout management
  useEffect(() => {
    if (user && sessionTimeRemaining > 0) {
      const timer = setInterval(() => {
        setSessionTimeRemaining(prev => {
          const newTime = prev - 1000;
          if (newTime <= 0) {
            handleSessionExpiry();
            return 0;
          }
          
          // Show warning only once when session is about to expire
          if (newTime <= 5 * 60 * 1000 && newTime > 4 * 60 * 1000 && !sessionWarningShown) {
            setSessionWarningShown(true);
            toast('Session will expire in 5 minutes', {
              icon: '⏰',
              duration: 4000,
            });
          }
          
          return newTime;
        });
      }, 1000);

      setSessionTimer(timer);
      return () => clearInterval(timer);
    }
  }, [user, sessionTimeRemaining, sessionWarningShown]);

  // Security: Handle session expiry
  const handleSessionExpiry = useCallback(async () => {
    toast.error('Session expired. Please sign in again.');
    await performCompleteLogout();
  }, []);

  // Security: Complete logout function
  const performCompleteLogout = async () => {
    try {
      // Clear session timer
      if (sessionTimer) {
        clearInterval(sessionTimer);
        setSessionTimer(null);
      }

      // Clear user state immediately
      setUser(null);
      setSessionTimeRemaining(0);
      setSessionChecked(false);
      
      // Clear all caches and storage
      clearCache();
      clearAllStorage();
      
      // Sign out from Supabase
      await supabaseSignOut();
      
      // Force page redirect to login
      window.location.replace('/login');
      
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if error occurs
      setUser(null);
      setSessionTimeRemaining(0);
      clearCache();
      clearAllStorage();
      window.location.replace('/login');
    }
  };

  // Security: Enhanced auth state checking
  const checkAuthState = async () => {
    try {      
      const currentUser = await getCurrentUser();
      
      if (currentUser) {
        // Security: Validate user data integrity
        if (!currentUser.id || !currentUser.email || !currentUser.role) {
          console.warn('Invalid user data structure, but not clearing session');
          setUser(null);
          setSessionTimeRemaining(0);
          setSessionChecked(true);
          return;
        }
        
        // Security: Validate role is legitimate
        if (!['admin', 'manager', 'worker'].includes(currentUser.role)) {
          console.warn('Invalid user role, but not clearing session');
          setUser(null);
          setSessionTimeRemaining(0);
          setSessionChecked(true);
          return;
        }
        
        setUser(currentUser);
        setSessionTimeRemaining(60 * 60 * 1000); // 1 hour
        setSessionChecked(true);
      } else {
        setUser(null);
        setSessionTimeRemaining(0);
        setSessionChecked(true);
      }
    } catch (error: any) {
      console.error('Auth state check failed:', error);
      // Don't clear user state on temporary errors during initial load
      if (!isInitializing) {
        setUser(null);
        setSessionTimeRemaining(0);
      }
      setSessionChecked(true);
    }
  };

  // Security: Re-check auth state periodically for logged-in users
  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        checkAuthState();
      }, 5 * 60 * 1000); // Check every 5 minutes

      return () => clearInterval(interval);
    }
  }
  )

  // Security: Enhanced sign in with comprehensive validation
  const signIn = async (email: string, password: string) => {
    // Security: Input validation
    if (!email?.trim() || !password) {
      throw new Error('Email and password are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    // Security: Email validation
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Please enter a valid email address');
    }

    // Security: Rate limiting
    if (!loginRateLimiter.isAllowed(normalizedEmail)) {
      const remainingTime = Math.ceil(loginRateLimiter.getRemainingTime(normalizedEmail) / 60000);
      throw new Error(`Too many login attempts. Please wait ${remainingTime} minutes before trying again.`);
    }

    try {
      setLoading(true);
      
      // Security: Clear any existing data before sign in
      clearCache();
      
      let authResponse;
      try {
        authResponse = await signInWithEmail(normalizedEmail, password);
      } catch (authError) {
        throw authError;
      }
      
      // Validate authentication response
      if (!authResponse) {
        throw new Error('No response from authentication service');
      }

      if (!authResponse.user) {
        throw new Error('Authentication succeeded but no user data received');
      }

      if (!authResponse.session) {
        throw new Error('Authentication succeeded but no session created');
      }

      // Security: Validate session integrity

      // Security: Get fresh user profile
      let userProfile;
      try {
        userProfile = await getCurrentUser();
      } catch (profileError) {
        throw new Error('Failed to load user profile after authentication');
      }
      
      if (!userProfile) {
        throw new Error('User profile not found after successful authentication');
      }

      // Security: Validate user profile integrity
      if (!userProfile.id || !userProfile.email || !userProfile.role) {
        throw new Error('User profile is missing required information');
      }

      setUser(userProfile);
      setSessionTimeRemaining(60 * 60 * 1000); // 1 hour
      setSessionChecked(true); // Mark session as checked
      
      // Return success to indicate login completed
      return { success: true, user: userProfile };
    } catch (error: any) {
      // Security: Clear everything on sign in failure
      setUser(null);
      setSessionTimeRemaining(0);
      setSessionChecked(true); // Mark as checked even on failure
      clearCache();
      
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Security: Enhanced sign up with comprehensive validation
  const signUp = async (email: string, password: string, fullName: string, role: 'admin' | 'manager' | 'worker' = 'worker') => {
    // Security: Input validation and sanitization
    if (!email?.trim() || !password || !fullName?.trim()) {
      throw new Error('All fields are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedFullName = sanitizeInput(fullName.trim());

    // Security: Enhanced validation
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('Please enter a valid email address');
    }

    const passwordCheck = password.length >= 8 && 
                         /[A-Z]/.test(password) && 
                         /[a-z]/.test(password) && 
                         /\d/.test(password);
    
    if (!passwordCheck) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers');
    }

    if (sanitizedFullName.length < 2) {
      throw new Error('Full name must be at least 2 characters long');
    }

    if (!['admin', 'manager', 'worker'].includes(role)) {
      throw new Error('Invalid role specified');
    }

    try {
      setLoading(true);
      
      // Security: Clear any existing data
      clearCache();
      clearAllStorage();
      
      await signUpWithEmail(normalizedEmail, password, sanitizedFullName, role);
      
      logSecurityEvent('signup_success');
      toast.success('Account created successfully! Please sign in.');
    } catch (error: any) {
      logSecurityEvent('signup_failure', { error: error.message?.substring(0, 50) });
      
      throw new Error(sanitizeErrorMessage(error.message) || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Security: Extend session with validation
  const extendSession = useCallback(() => {
    if (user && sessionTimeRemaining > 0) {
      setSessionTimeRemaining(60 * 60 * 1000); // Reset to 1 hour
      setSessionWarningShown(false); // Reset warning flag
      toast.success('Session extended for 1 hour');
    }
  }, [user, sessionTimeRemaining]);

  // Security: Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionTimer) {
        clearInterval(sessionTimer);
      }
    };
  }, [sessionTimer]);

  // Security: Visibility change handler for session validation
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        // Security: Re-validate session when tab becomes visible
        checkAuthState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  // Security: Beforeunload handler for cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionTimer) {
        clearInterval(sessionTimer);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionTimer]);

  // Security: Global error handler
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('auth') || event.error?.message?.includes('session')) {
        performCompleteLogout();
      }
    };

    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  const value = {
    user,
    loading: loading || isInitializing,
    sessionChecked,
    sessionTimeRemaining,
    signIn,
    signUp,
    signOut: performCompleteLogout,
    extendSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}