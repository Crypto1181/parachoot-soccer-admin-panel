import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Mail, ArrowRight, Tv, UserPlus } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('sponky33333@gmail.com');
  const [password, setPassword] = useState('Parachootsoccer1@');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user && data.session) {
            navigate('/');
        } else {
            setMessage('Registration successful! Please check your email to verify your account.');
            setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1579952363873-27f3bde9be2d?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-10"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/90 to-transparent"></div>
      
      <Card className="w-full max-w-md relative z-10 border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-3 text-center pb-8">
          <div className="flex justify-center mb-2">
            <div className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <Tv className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-white tracking-tight">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription className="text-slate-400 text-base">
            {isSignUp ? 'Enter your details to create a new account' : 'Sign in to manage your Parachoot platform'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 h-11"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 h-11"
                  required
                />
              </div>
            </div>
            
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            )}
            
            {message && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
                {message}
              </div>
            )}

            <Button 
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-900/20 transition-all duration-200" 
              type="submit" 
              disabled={loading}
            >
              {loading ? (
                'Processing...'
              ) : (
                <span className="flex items-center gap-2">
                  {isSignUp ? 'Sign Up' : 'Sign In'} 
                  {isSignUp ? <UserPlus className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                </span>
              )}
            </Button>
            
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError(null);
                    setMessage(null);
                }}
                className="text-slate-400 hover:text-white text-sm transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </form>
        </CardContent>
        <div className="px-6 pb-6 text-center">
            <p className="text-xs text-slate-600">
                Protected by Supabase Auth
            </p>
        </div>
      </Card>
    </div>
  );
}
