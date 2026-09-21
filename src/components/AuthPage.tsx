import { useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { KalaLogo } from '@/components/KalaLogo';
import type { User } from '@/types';

interface AuthPageProps {
  onSuccess: (user: User) => void;
  hasInvitation?: boolean;
}

export function AuthPage({ onSuccess, hasInvitation }: AuthPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please fill in all fields.');
      return;
    }
    try {
      setLoginLoading(true);
      const user = await api.login({ email: loginEmail.trim(), password: loginPassword });
      onSuccess(user);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to log in');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    const email = registerEmail.trim();
    if (!email || !registerPassword) {
      setRegisterError('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRegisterError('Please enter a valid email address.');
      return;
    }
    if (registerPassword.length < 6) {
      setRegisterError('Password must be at least 6 characters long.');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('Passwords do not match.');
      return;
    }
    try {
      setRegisterLoading(true);
      const user = await api.register({ email, password: registerPassword });
      onSuccess(user);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF8] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <KalaLogo size={52} />
          <div>
            <h1 className="text-xl font-bold tracking-[0.14em] text-foreground">KALA</h1>
            <p className="mt-0.5 text-[11px] font-medium tracking-[0.18em] text-muted-foreground">KANBAN & FLOW</p>
          </div>
          <p className="max-w-80 text-sm leading-relaxed text-muted-foreground">
            {hasInvitation
              ? 'You have been invited to a board. Sign in, or register, with the email address the invitation was sent to.'
              : 'Sign in to manage your workspaces and boards'}
          </p>
        </div>

        <Card className="border bg-white shadow-[0_4px_16px_-4px_rgba(42,47,54,0.12)]" style={{ borderColor: 'var(--kala-line)' }}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
            <CardHeader className="pb-4">
              <CardTitle className="sr-only">Sign in to Kala</CardTitle>
              <CardDescription className="sr-only">Sign in or create a Kala account</CardDescription>
              <TabsList className="grid w-full grid-cols-2 bg-[#F2F1ED]">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="login" className="mt-0 space-y-4">
                <form onSubmit={handleLogin} noValidate className="space-y-4">
                  {loginError && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-sm font-medium text-destructive" role="alert">
                      {loginError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input id="login-email" type="email" placeholder="name@example.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} disabled={loginLoading} className="bg-white pl-9" autoFocus autoComplete="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input id="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} disabled={loginLoading} className="bg-white pl-9" autoComplete="current-password" />
                    </div>
                  </div>
                  <Button type="submit" className="h-10 w-full bg-[#2A2F36] text-white hover:bg-[#1E2329]" disabled={loginLoading}>
                    {loginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-0 space-y-4">
                <form onSubmit={handleRegister} noValidate className="space-y-4">
                  {registerError && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3 text-sm font-medium text-destructive" role="alert">
                      {registerError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input id="register-email" type="email" placeholder="name@example.com" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} disabled={registerLoading} className="bg-white pl-9" autoFocus autoComplete="email" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input id="register-password" type="password" placeholder="At least 6 characters" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} disabled={registerLoading} className="bg-white pl-9" autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input id="register-confirm-password" type="password" placeholder="Repeat your password" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} disabled={registerLoading} className="bg-white pl-9" autoComplete="new-password" />
                    </div>
                  </div>
                  <Button type="submit" className="h-10 w-full bg-[#2A2F36] text-white hover:bg-[#1E2329]" disabled={registerLoading}>
                    {registerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Calm boards for focused teams · Kala Kanban & Flow
        </p>
      </div>
    </div>
  );
}
