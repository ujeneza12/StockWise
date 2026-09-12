import { createClient } from '@supabase/supabase-js';
import { sanitizeInput, sanitizeErrorMessage, validateInput, logSecurityEvent } from '../utils/security';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isSupabaseConfigured = supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'your_supabase_project_url' && 
  supabaseAnonKey !== 'your_supabase_anon_key' &&
  isValidUrl(supabaseUrl) &&
  !supabaseUrl.includes('localhost') &&
  !supabaseUrl.includes('127.0.0.1') &&
  supabaseUrl.includes('supabase.co');

if (!isSupabaseConfigured) {
  console.warn('Supabase is not properly configured. Please set up your Supabase project by clicking "Connect to Supabase" in the top right corner.');
}

const createMockClient = () => ({
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    signUp: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
    signOut: () => Promise.resolve({ error: null }),
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    }
  },
  from: () => ({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }),
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }),
    update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }) }),
    delete: () => ({ neq: () => Promise.resolve({ error: new Error('Supabase not configured') }) }),
  }),
  rpc: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }),
});

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockClient() as any;

// Cache for frequently accessed data
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to get cached data or fetch new data
const getCachedData = async (key: string, fetchFn: () => Promise<any>) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Clear cache function
export const clearCache = (key?: string) => {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'worker';
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  description?: string;
  status: 'approved' | 'pending';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  product_name: string;
  quantity_sold: number;
  unit_price: number;
  total_amount: number;
  sold_by: string;
  customer_name?: string;
  is_credit: boolean;
  created_at: string;
}

export interface Credit {
  id: string;
  sale_id: string | null;
  customer_name: string;
  amount: number;
  product_name: string;
  issued_by: string;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustment {
  id: string;
  product_id: string;
  product_name: string;
  adjustment_type: 'increase' | 'decrease';
  quantity_adjusted: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  adjusted_by: string;
  adjusted_by_name: string;
  created_at: string;
}

export interface DailyReportStorage {
  id: string;
  report_date: string;
  no: number;
  libelle: string;
  stock: number;
  entres: number;
  total_jour: number;
  solde: number;
  sortie: number;
  p_unit1: number;
  p_total: number;
  amavide: number;
  product_id: string;
  created_at: string;
  created_by?: string;
}

export const getCurrentUser = async (): Promise<User | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    // First check if we have a session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return null;
    }
    
    const user = session.user;
    
    // Get user profile from database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // If profile doesn't exist, try to create it
      if (profileError.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            role: user.user_metadata?.role || 'worker'
          }])
          .select()
          .single();
          
        if (createError) {
          console.error('Failed to create profile:', createError);
          return null;
        }
        return newProfile;
      }
      return null;
    }

    return profile;
  } catch (error: any) {
    console.error('getCurrentUser error:', error);
    return null;
  }
};

// Optimized function to get products with caching
export const getProducts = async () => {
  if (!isSupabaseConfigured) {
    return [];
  }

  const cacheKey = 'products';
  return await getCachedData(cacheKey, async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, quantity, category, status, created_at')
      .eq('status', 'approved')
      .order('name');
    
    if (error) throw error;
    return data || [];
  });
};

// Optimized function to get credits with caching
export const getCredits = async (userId?: string) => {
  if (!isSupabaseConfigured) {
    return [];
  }

  // Don't use cache for credits to ensure real-time updates
  let query = supabase
    .from('credits')
    .select('id, customer_name, amount, product_name, status, due_date, created_at')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('issued_by', userId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// Optimized function to get users with caching
export const getUsers = async () => {
  if (!isSupabaseConfigured) {
    return [];
  }

  const cacheKey = 'users';
  return await getCachedData(cacheKey, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  });
};

// Get system users status (total users, missing roles, etc.)
export const getSystemUsersStatus = async () => {
  if (!isSupabaseConfigured) {
    return {
      total_users: 0,
      admin_count: 0,
      manager_count: 0,
      worker_count: 0,
      remaining_slots: 3,
      missing_roles: ['admin', 'manager', 'worker']
    };
  }

  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('role');

    if (error) throw error;

    const adminCount = users.filter((u) => u.role === 'admin').length;
    const managerCount = users.filter((u) => u.role === 'manager').length;
    const workerCount = users.filter((u) => u.role === 'worker').length;
    const total = users.length;

    const missingRoles: string[] = [];
    if (adminCount === 0) missingRoles.push('admin');
    if (managerCount === 0) missingRoles.push('manager');
    if (workerCount === 0) missingRoles.push('worker');

    return {
      total_users: total,
      admin_count: adminCount,
      manager_count: managerCount,
      worker_count: workerCount,
      remaining_slots: Math.max(0, 3 - total),
      missing_roles: missingRoles
    };
  } catch (error) {
    console.error('Error fetching system users status:', error);
    return {
      total_users: 0,
      admin_count: 0,
      manager_count: 0,
      worker_count: 0,
      remaining_slots: 3,
      missing_roles: ['admin', 'manager', 'worker']
    };
  }
};

// Check if a role can be added
export const canAddUserWithRole = async (role: string) => {
  if (!isSupabaseConfigured) {
    return false;
  }

  try {
    const { data, error } = await supabase.rpc('can_add_user_with_role', {
      target_role: role
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error checking if role can be added:', error);
    return false;
  }
};

// Optimized function to get stock adjustments with caching
export const getStockAdjustments = async (productId?: string) => {
  if (!isSupabaseConfigured) {
    return [];
  }

  const cacheKey = `stock_adjustments_${productId || 'all'}`;
  return await getCachedData(cacheKey, async () => {
    let query = supabase
      .from('stock_adjustments')
      .select('id, product_name, adjustment_type, quantity_adjusted, previous_quantity, new_quantity, reason, adjusted_by_name, created_at')
      .order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  });
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseConfigured) {
    const error = new Error('Authentication service not available');
    logSecurityEvent('auth_service_unavailable');
    throw error;
  }

  // Enhanced input validation
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    logSecurityEvent('auth_invalid_input', { email: email ? '[provided]' : '[missing]' });
    throw new Error('Email and password are required');
  }

  // Sanitize and validate email
  const sanitizedEmail = sanitizeInput(email.trim().toLowerCase(), 254);
  if (!sanitizedEmail || sanitizedEmail.length < 5 || !sanitizedEmail.includes('@')) {
    logSecurityEvent('auth_invalid_email_format');
    throw new Error('Please enter a valid email address');
  }

  if (password.length < 6) {
    logSecurityEvent('auth_weak_password');
    throw new Error('Password must be at least 6 characters long');
  }

  try {
    
    const response = await supabase.auth.signInWithPassword({
      email: sanitizedEmail,
      password,
    });

    // Enhanced response validation
    if (!response) {
      logSecurityEvent('auth_no_response');
      throw new Error('Authentication service error');
    }

    const { data, error } = response;


    if (error) {
      if (error.message?.includes('Invalid login credentials')) {
        throw new Error('Invalid email or password');
      } else if (error.message?.includes('Email not confirmed')) {
        throw new Error('Please verify your email address');
      } else if (error.message?.includes('Too many requests')) {
        throw new Error('Too many login attempts. Please wait.');
      } else {
        throw new Error(error.message || 'Authentication failed');
      }
    }

    // Validate response data structure
    if (!data || typeof data !== 'object') {
      logSecurityEvent('auth_invalid_response_format');
      throw new Error('Invalid authentication response format');
    }

    if (!data.user) {
      logSecurityEvent('auth_no_user_data');
      throw new Error('Authentication successful but no user data received');
    }

    if (!data.session) {
      logSecurityEvent('auth_no_session');
      throw new Error('Authentication successful but no session created');
    }

    // Validate user object structure
    if (!data.user.id || !data.user.email) {
      logSecurityEvent('auth_invalid_user_structure');
      throw new Error('Invalid user data structure received');
    }

    logSecurityEvent('auth_success', { user_id: data.user.id });
    return data;
    
  } catch (error: any) {
    // Re-throw with more context if it's our custom error
    if (error.message?.includes('Authentication') || 
        error.message?.includes('Invalid') ||
        error.message?.includes('No response')) {
      throw error;
    }
    
    // For unexpected errors, provide a generic message
    throw new Error('Login failed due to a technical issue. Please try again.');
  }
};

export const signUpWithEmail = async (email: string, password: string, fullName: string, role: 'admin' | 'manager' | 'worker' = 'worker') => {
  if (!isSupabaseConfigured) {
    logSecurityEvent('signup_service_unavailable');
    throw new Error('Registration service not available');
  }

  // Enhanced input validation with sanitization
  if (!email || !password || !fullName || 
      typeof email !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
    logSecurityEvent('signup_missing_fields');
    throw new Error('All fields are required');
  }

  // Validate and sanitize inputs
  const sanitizedEmail = sanitizeInput(email.trim().toLowerCase(), 254);
  const sanitizedFullName = sanitizeInput(fullName.trim(), 100);
  
  const emailValidation = validateInput.name(sanitizedEmail);
  if (!emailValidation.isValid || !sanitizedEmail.includes('@')) {
    logSecurityEvent('signup_invalid_email');
    throw new Error('Please enter a valid email address');
  }

  // Password validation
  const passwordCheck = password.length >= 8 && 
                       /[A-Z]/.test(password) && 
                       /[a-z]/.test(password) && 
                       /\d/.test(password);
  
  if (!passwordCheck) {
    logSecurityEvent('signup_weak_password');
    throw new Error('Password must be at least 8 characters with uppercase, lowercase, and numbers');
  }

  const nameValidation = validateInput.name(sanitizedFullName);
  if (!nameValidation.isValid) {
    logSecurityEvent('signup_invalid_name');
    throw new Error(nameValidation.error || 'Invalid full name');
  }

  const roleValidation = validateInput.role(role);
  if (!roleValidation.isValid) {
    logSecurityEvent('signup_invalid_role');
    throw new Error(roleValidation.error || 'Invalid role specified');
  }

  try {
    // Create user with auto-confirmation for admin-created accounts
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password,
      options: {
        data: {
          full_name: sanitizedFullName,
          role: role
        },
        emailRedirectTo: undefined // Disable email confirmation
      }
    });


    if (authError) {
      console.error('Sign up error:', authError.message);
      
      if (authError.message?.includes('User already registered')) {
        throw new Error('A user with this email address already exists');
      }
      
      throw new Error(authError.message || 'Failed to create user account');
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user returned from authentication');
    }

    // Wait a moment for the user to be fully created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if profile already exists (created by trigger)
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.warn('Profile check error:', profileCheckError.message);
    }

    // Create profile if it doesn't exist
    if (!existingProfile) {
      const profileData = {
        id: authData.user.id,
        email: sanitizedEmail,
        full_name: sanitizedFullName,
        role: role
      };

      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert([profileData])
        .select()
        .single();

      if (profileError) {
        console.error('Profile creation error:', profileError.message);
        
        if (profileError.code === '23505') {
          throw new Error('A user with this email already exists');
        } else {
          throw new Error('Failed to create user profile. Please try again.');
        }
      }

      return { ...authData, profile: newProfile };
    } else {
      return { ...authData, profile: existingProfile };
    }
  } catch (error: any) {
    logSecurityEvent('signup_failure', { error: error.message?.substring(0, 50) });
    throw new Error(error.message || 'Failed to create user account');
  }
};

export const signOut = async () => {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Sign out timeout')), 5000);
    });

    const signOutPromise = supabase.auth.signOut();
    const { error } = await Promise.race([signOutPromise, timeoutPromise]);
    
    if (error) {
      logSecurityEvent('signout_error');
      throw error;
    }
    
    // Clear any cached data
    clearCache();
  } catch (error: any) {
    logSecurityEvent('signout_failure');
    // Clear cache even if sign out fails
    clearCache();
    throw error;
  }
};

export const getDailyReportsStorage = async (startDate?: string, endDate?: string) => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured. Please set up your Supabase project.');
  }

  try {
    let query = supabase
      .from('daily_reports_storage')
      .select('*')
      .order('report_date', { ascending: false })
      .order('no', { ascending: true });

    if (startDate) {
      query = query.gte('report_date', startDate);
    }

    if (endDate) {
      query = query.lte('report_date', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    throw error;
  }
};

export const generateDailyReport = async (targetDate: string = new Date().toISOString().split('T')[0]) => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured. Please set up your Supabase project.');
  }

  try {
    const { data, error } = await supabase.rpc('manual_generate_daily_report', {
      target_date: targetDate
    });

    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
};

export const getDailyReportForDate = async (date: string) => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured. Please set up your Supabase project.');
  }

  try {
    const { data, error } = await supabase
      .from('daily_reports_storage')
      .select('*')
      .eq('report_date', date)
      .order('no', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    throw error;
  }
};

export const isSupabaseReady = () => isSupabaseConfigured;

// Cleanup functions for old records
export const runManualCleanup = async () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase.rpc('run_weekly_cleanup');
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
};

export const getCleanupLogs = async (limit: number = 50) => {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('cleanup_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching cleanup logs:', error);
    return [];
  }
};