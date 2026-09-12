import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Store, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { isSupabaseReady } from "../../lib/supabase";
import { sanitizeInput, isValidEmail, logSecurityEvent } from "../../utils/security";
import ThemeToggle from "../ThemeToggle";
import toast from "react-hot-toast";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { signIn, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  React.useEffect(() => {
    if (user && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [user, authLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Security: Enhanced input validation
    setSubmitting(true);

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      logSecurityEvent('login_missing_credentials');
      toast.error("Please fill in all fields");
      setSubmitting(false);
      return;
    }

    // Sanitize and validate email
    const sanitizedEmail = sanitizeInput(email.trim().toLowerCase(), 254);
    if (!isValidEmail(sanitizedEmail)) {
      logSecurityEvent('login_invalid_email_format');
      toast.error("Please enter a valid email address");
      setSubmitting(false);
      return;
    }

    if (password.length < 6) {
      logSecurityEvent('login_short_password');
      toast.error("Password must be at least 6 characters long");
      setSubmitting(false);
      return;
    }

    if (!isSupabaseReady()) {
      logSecurityEvent('login_service_unavailable');
      toast.error(
        "Authentication service not configured. Please set up Supabase."
      );
      setSubmitting(false);
      return;
    }

    try {
      let result;
      try {
        result = await signIn(sanitizedEmail, password);
      } catch (signInError) {
        throw signInError;
      }
      
      // Only navigate if sign in was successful
      if (result && result.success) {
        logSecurityEvent('login_success');
        toast.success('Login successful! Redirecting...');
        navigate(from, { replace: true });
      } else {
        logSecurityEvent('login_success_flag_missing');
        throw new Error('Authentication completed but success flag not set');
      }
    } catch (error: any) {
      logSecurityEvent('login_failure', { error: error?.message?.substring(0, 50) });
      toast.error(error?.message || 'Sign in failed. Please try again.');
      
      // Clear password field on error for security
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = submitting || authLoading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Theme Toggle - Top Right */}
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        <div>
          <div className="flex justify-center">
            <div className="flex items-center">
              <Store className="h-12 w-12 text-blue-600" />
              <span className="ml-2 text-3xl font-bold text-gray-900 dark:text-white">
                RGBUSS
              </span>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900 dark:text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Business Management System
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email Address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading || !isSupabaseReady()}
                  className="pl-10 appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                  placeholder="Enter your email address"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading || !isSupabaseReady()}
                  className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white bg-white dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading || !isSupabaseReady()}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !isSupabaseReady()}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  {submitting ? "Signing in..." : "Loading profile..."}
                </div>
              ) : !isSupabaseReady() ? (
                "Supabase Not Configured"
              ) : (
                "Sign in"
              )}
            </button>
          </div>

        </form>

        {/* Loading Status */}
        {isLoading && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mt-0.5"></div>
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {submitting ? "Authenticating..." : "Loading your profile..."}
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {submitting
                  ? "Verifying your credentials with the server..."
                  : "Setting up your dashboard and permissions..."}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                This may take a few seconds. Please wait...
              </p>
            </div>
          </div>
        )}
        {/* Authentication Tips */}
        {!isLoading && !isSupabaseReady() && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-blue-400 dark:text-blue-300 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Supabase Configuration Required
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>
                    The authentication service is not configured. Please set up
                    your Supabase project:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Click "Connect to Supabase" in the top right corner</li>
                    <li>Or configure your environment variables manually</li>
                    <li>Ensure your Supabase URL and API key are correct</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
