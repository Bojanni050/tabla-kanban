import { useState } from 'react';
import { LayoutDashboard, Loader2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthPageProps {
  onSuccess: (user: User) => void;
  // Shown when the user arrived through a board invitation link
  hasInvitation?: boolean;
}

export function AuthPage({ onSuccess, hasInvitation }: AuthPageProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Register form state
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
      const user = await api.login({
        email: loginEmail.trim(),
        password: loginPassword,
      });
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
      const user = await api.register({
        email,
        password: registerPassword,
      });
      onSuccess(user);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Tabla</h1>
          <p className="text-sm text-muted-foreground">
            {hasInvitation
              ? 'You have been invited to a board. Sign in, or register, with the email address the invitation was sent to.'
              : 'Sign in to manage your workspaces and boards'}
          </p>
        </div>

        <Card className="shadow-lg">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* Login Tab */}
              <TabsContent value="login" className="mt-0 space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
                      {loginError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="name@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        disabled={loginLoading}
                        className="pl-9"
                        autoFocus
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        disabled={loginLoading}
                        className="pl-9"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="mt-0 space-y-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  {registerError && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
                      {registerError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="name@example.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        disabled={registerLoading}
                        className="pl-9"
                        autoFocus
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="At least 6 characters"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        disabled={registerLoading}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-confirm-password"
                        type="password"
                        placeholder="Repeat your password"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        disabled={registerLoading}
                        className="pl-9"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={registerLoading}>
                    {registerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
