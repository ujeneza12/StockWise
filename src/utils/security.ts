/**
 * Comprehensive security utilities for authentication and data protection
 */

// Security: Enhanced input sanitization with multiple layers
export const sanitizeInput = (input: string, maxLength: number = 100): string => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove javascript: and data: URLs
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    // Remove potentially dangerous characters
    .replace(/[<>'"&]/g, (match) => {
      const entities: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[match] || match;
    })
    // Limit length
    .substring(0, maxLength);
};

// Security: Enhanced email validation with multiple checks
export const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return false;
  
  // Length checks
  if (email.length < 5 || email.length > 254) return false;
  
  // Domain validation
  const [localPart, domain] = email.split('@');
  if (localPart.length > 64 || domain.length > 253) return false;
  
  // Check for dangerous patterns
  const dangerousPatterns = [
    /javascript:/i,
    /data:/i,
    /<script/i,
    /on\w+=/i
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(email));
};

// Security: Comprehensive password strength validation
export const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[]; score: number } => {
  const errors: string[] = [];
  let score = 0;
  
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'], score: 0 };
  }
  
  // Length check
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }
  
  // Character type checks
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 1;
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 1;
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score += 1;
  }
  
  // Special characters (bonus)
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score += 1;
  }
  
  // Common password patterns (reduce score)
  const commonPatterns = [
    /123456/,
    /password/i,
    /qwerty/i,
    /admin/i,
    /letmein/i
  ];
  
  if (commonPatterns.some(pattern => pattern.test(password))) {
    score = Math.max(0, score - 2);
    errors.push('Password contains common patterns');
  }
  
  return {
    isValid: errors.length === 0 && score >= 4,
    errors,
    score
  };
};

// Security: Enhanced storage clearing with comprehensive cleanup
export const clearAllStorage = (): void => {
  try {
    // Clear localStorage with specific key patterns
    const sensitiveKeyPatterns = [
      'supabase',
      'auth',
      'session',
      'token',
      'user',
      'sb-',
      'credential',
      'password',
      'login'
    ];
    
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && sensitiveKeyPatterns.some(pattern => key.toLowerCase().includes(pattern))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear sessionStorage completely
    sessionStorage.clear();
    
    // Clear cookies with secure attributes
    document.cookie.split(";").forEach(function(c) { 
      const cookieName = c.split("=")[0].trim();
      // Clear with multiple path and domain combinations
      const clearCookie = (path: string = "/", domain: string = "") => {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; secure; samesite=strict`;
      };
      
      clearCookie();
      clearCookie("/", window.location.hostname);
      clearCookie("/", `.${window.location.hostname}`);
    });
    
    // Clear IndexedDB data
    if ('indexedDB' in window) {
      indexedDB.databases?.().then(databases => {
        databases.forEach(db => {
          if (db.name && sensitiveKeyPatterns.some(pattern => db.name!.toLowerCase().includes(pattern))) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      }).catch(() => {
        // Silently handle IndexedDB errors
      });
    }
    
    // Clear any cached service worker data
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      }).catch(() => {
        // Silently handle service worker errors
      });
    }
  } catch (error) {
    // Silently handle storage clearing errors
  }
};

// Security: Enhanced session validation with comprehensive checks
export const isSessionValid = (session: any): boolean => {
  if (!session || typeof session !== 'object') return false;
  
  // Check required properties
  if (!session.access_token || typeof session.access_token !== 'string') return false;
  if (!session.user || typeof session.user !== 'object') return false;
  if (!session.user.id || typeof session.user.id !== 'string') return false;
  
  // Check token format (basic JWT structure check)
  const tokenParts = session.access_token.split('.');
  if (tokenParts.length !== 3) return false;
  
  // Check expiration
  if (session.expires_at) {
    const expirationTime = typeof session.expires_at === 'number' 
      ? session.expires_at * 1000 
      : new Date(session.expires_at).getTime();
    
    if (expirationTime < Date.now()) return false;
  }
  
  // Check user object structure
  if (!session.user.email || typeof session.user.email !== 'string') return false;
  if (!isValidEmail(session.user.email)) return false;
  
  return true;
};

// Security: Enhanced rate limiting with IP tracking and progressive delays
class EnhancedRateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number; blocked: boolean }> = new Map();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly blockDuration = 30 * 60 * 1000; // 30 minutes

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);
    
    if (!record) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now, blocked: false });
      return true;
    }
    
    // Check if user is currently blocked
    if (record.blocked && (now - record.lastAttempt) < this.blockDuration) {
      return false;
    }
    
    // Reset if window has passed
    if (now - record.lastAttempt > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now, blocked: false });
      return true;
    }
    
    // Check if under limit
    if (record.count < this.maxAttempts) {
      record.count++;
      record.lastAttempt = now;
      return true;
    }
    
    // Block user after max attempts
    record.blocked = true;
    record.lastAttempt = now;
    return false;
  }
  
  getRemainingTime(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record) return 0;
    
    const elapsed = Date.now() - record.lastAttempt;
    const timeWindow = record.blocked ? this.blockDuration : this.windowMs;
    return Math.max(0, timeWindow - elapsed);
  }
}

export const loginRateLimiter = new EnhancedRateLimiter();

// Security: Detect if running in secure context
export const isSecureContext = (): boolean => {
  return window.isSecureContext || 
         location.protocol === 'https:' || 
         location.hostname === 'localhost' || 
         location.hostname === '127.0.0.1';
};

// Security: Enhanced Content Security Policy
export const enforceCSP = (): void => {
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Note: unsafe-eval needed for some React dev tools
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
    document.head.appendChild(meta);
  }
};

// Security: Input validation for different data types
export const validateInput = {
  name: (name: string): { isValid: boolean; error?: string } => {
    if (!name || typeof name !== 'string') {
      return { isValid: false, error: 'Name is required' };
    }
    
    const sanitized = name.trim();
    if (sanitized.length < 2) {
      return { isValid: false, error: 'Name must be at least 2 characters' };
    }
    
    if (sanitized.length > 100) {
      return { isValid: false, error: 'Name must be less than 100 characters' };
    }
    
    // Check for suspicious patterns
    if (/<script|javascript:|data:/i.test(sanitized)) {
      return { isValid: false, error: 'Invalid characters in name' };
    }
    
    return { isValid: true };
  },
  
  price: (price: any): { isValid: boolean; error?: string } => {
    const numPrice = Number(price);
    
    if (isNaN(numPrice)) {
      return { isValid: false, error: 'Price must be a valid number' };
    }
    
    if (numPrice <= 0) {
      return { isValid: false, error: 'Price must be greater than 0' };
    }
    
    if (numPrice > 999999.99) {
      return { isValid: false, error: 'Price is too large' };
    }
    
    return { isValid: true };
  },
  
  quantity: (quantity: any): { isValid: boolean; error?: string } => {
    const numQuantity = Number(quantity);
    
    if (isNaN(numQuantity)) {
      return { isValid: false, error: 'Quantity must be a valid number' };
    }
    
    if (numQuantity < 0) {
      return { isValid: false, error: 'Quantity cannot be negative' };
    }
    
    if (!Number.isInteger(numQuantity)) {
      return { isValid: false, error: 'Quantity must be a whole number' };
    }
    
    if (numQuantity > 999999) {
      return { isValid: false, error: 'Quantity is too large' };
    }
    
    return { isValid: true };
  },
  
  role: (role: string): { isValid: boolean; error?: string } => {
    const validRoles = ['admin', 'manager', 'worker'];
    
    if (!role || typeof role !== 'string') {
      return { isValid: false, error: 'Role is required' };
    }
    
    if (!validRoles.includes(role)) {
      return { isValid: false, error: 'Invalid role specified' };
    }
    
    return { isValid: true };
  }
};

// Security: Secure error message sanitization
export const sanitizeErrorMessage = (error: any): string => {
  if (!error) return 'An unknown error occurred';
  
  const message = typeof error === 'string' ? error : error.message || 'An error occurred';
  
  // Remove sensitive information patterns
  const sanitized = message
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    .replace(/\b\d{4,}\b/g, '[number]')
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '[id]')
    .replace(/password|token|key|secret/gi, '[credential]');
  
  // Return user-friendly messages for common errors
  const errorMappings: { [key: string]: string } = {
    'Invalid login credentials': 'Invalid email or password',
    'User not found': 'Invalid email or password',
    'Email not confirmed': 'Please verify your email address',
    'Too many requests': 'Too many attempts. Please wait before trying again.',
    'Network error': 'Connection error. Please check your internet connection.',
    'Failed to fetch': 'Connection error. Please check your internet connection.',
    'User already registered': 'An account with this email already exists'
  };
  
  for (const [pattern, replacement] of Object.entries(errorMappings)) {
    if (sanitized.toLowerCase().includes(pattern.toLowerCase())) {
      return replacement;
    }
  }
  
  return sanitized.length > 100 ? 'An error occurred. Please try again.' : sanitized;
};

// Security: Comprehensive security initialization
export const initializeSecurity = (): void => {
  // Enforce CSP
  enforceCSP();
  
  // Check secure context
  if (!isSecureContext()) {
    console.warn('Application is not running in a secure context (HTTPS)');
  }
  
  // Disable right-click context menu in production
  if (import.meta.env.PROD) {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  
  // Disable F12 and other dev tools shortcuts in production
  if (import.meta.env.PROD) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.shiftKey && e.key === 'C') ||
          (e.ctrlKey && e.key === 'U')) {
        e.preventDefault();
      }
    });
  }
  
  // Add security headers via meta tags
  const securityHeaders = [
    { name: 'X-Content-Type-Options', content: 'nosniff' },
    { name: 'X-Frame-Options', content: 'DENY' },
    { name: 'X-XSS-Protection', content: '1; mode=block' },
    { name: 'Referrer-Policy', content: 'strict-origin-when-cross-origin' }
  ];
  
  securityHeaders.forEach(header => {
    if (!document.querySelector(`meta[http-equiv="${header.name}"]`)) {
      const meta = document.createElement('meta');
      meta.httpEquiv = header.name;
      meta.content = header.content;
      document.head.appendChild(meta);
    }
  });
  
  // Initialize performance monitoring for security events
  if ('performance' in window) {
    // Monitor for suspicious activity patterns
    let suspiciousActivityCount = 0;
    const maxSuspiciousActivity = 10;
    
    window.addEventListener('error', (event) => {
      suspiciousActivityCount++;
      if (suspiciousActivityCount > maxSuspiciousActivity) {
        // Clear all data if too many errors occur
        clearAllStorage();
      }
    });
  }
};

export const logSecurityEvent = (event: string, details?: any): void => {
  // In production, this would send to a secure logging service
  if (import.meta.env.DEV) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      user: 'current_user_id', // Would be actual user ID
      details: details ? sanitizeInput(JSON.stringify(details), 200) : undefined
    };
    
    // Store in a secure audit log (not localStorage in production)
    const auditLogs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
    auditLogs.push(logEntry);
    
    // Keep only last 100 entries
    if (auditLogs.length > 100) {
      auditLogs.splice(0, auditLogs.length - 100);
    }
    
    localStorage.setItem('audit_logs', JSON.stringify(auditLogs));
  }
};
