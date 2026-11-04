import { useState, FormEvent } from 'react';
import { BookOpen, Eye, EyeOff, Loader2, Mail, Lock, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/features/auth';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function AuthScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [formValues, setFormValues] = useState({
    signin: { email: '', password: '' },
    signup: { email: '', password: '' },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { email, password } = formValues[mode];
    const result = await fn(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (!result.ok) {
      setGoogleLoading(false);
      setError(result.error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-700/20 border border-amber-500/30 mb-4">
            <BookOpen aria-hidden="true" className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-stone-100 tracking-tight">Lumiere</h1>
          <p className="text-stone-400 mt-2 text-sm">Your personal reading sanctuary</p>
        </div>

        <div className="bg-stone-900/60 backdrop-blur-xl rounded-2xl border border-stone-700/50 p-8 shadow-2xl">
          <div className="flex gap-1 p-1 bg-stone-800/60 rounded-lg mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signin'
                  ? 'bg-amber-700 text-white shadow-lg shadow-amber-600/20'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signup'
                  ? 'bg-amber-700 text-white shadow-lg shadow-amber-600/20'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full py-3 bg-white hover:bg-stone-50 text-stone-700 font-medium rounded-lg transition-all border border-stone-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {googleLoading ? (
                <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin text-stone-400" />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
              Continue with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-700/50" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-stone-900/60 px-3 text-stone-400 uppercase tracking-wide">or</span>
              </div>
            </div>

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-stone-400 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  id="auth-email" type="email" autoComplete="email"
                  aria-invalid={!!error} aria-describedby={error ? "auth-error" : undefined}
                  required
                  value={formValues[mode].email}
                  onChange={(e) => setFormValues((values) => ({
                    ...values,
                    [mode]: { ...values[mode], email: e.target.value },
                  }))}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-stone-800/60 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/50 focus:border-amber-600/50 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-stone-400 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Lock aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  id="auth-password" autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  aria-invalid={!!error} aria-describedby={error ? "auth-error" : undefined}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={formValues[mode].password}
                  onChange={(e) => setFormValues((values) => ({
                    ...values,
                    [mode]: { ...values[mode], password: e.target.value },
                  }))}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-11 py-3 bg-stone-800/60 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/50 focus:border-amber-600/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-300 transition-colors"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                    : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div id="auth-error" role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <UserIcon aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Your account is created instantly — no email confirmation needed.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-700 hover:bg-amber-800 text-white font-medium rounded-lg transition-all shadow-lg shadow-amber-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-400 text-xs mt-6">
          A quiet space for great stories and ideas.
        </p>
      </div>
    </div>
  );
}
