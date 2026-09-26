import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Check, Copy, Link2, Loader2, Plug, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { IntegrationKeyInfo, IntegrationProviderInfo, MintedIntegrationKey } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Settings -> Integrations: manage machine API keys for the external integration API
// (/api/integrations). Providers themselves are configured through INTEGRATION_* env
// variables on the server; this section only lists what is configured and lets the
// signed-in user mint/revoke their own keys. The plaintext token is shown exactly once.

const line = { borderColor: 'var(--kala-line)' };

const formatDate = (value: string | null) => {
  if (!value) return '—';
  try {
    return format(new Date(value), 'MMM d, yyyy');
  } catch {
    return '—';
  }
};

const formatLastUsed = (value: string | null) => {
  if (!value) return 'Never';
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
};

export function IntegrationSettingsSection({ active }: { active: boolean }) {
  const { toast } = useToast();
  const [providers, setProviders] = useState<IntegrationProviderInfo[] | null>(null);
  const [keys, setKeys] = useState<IntegrationKeyInfo[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newProvider, setNewProvider] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<MintedIntegrationKey | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const reload = async () => {
    const [providerList, keyList] = await Promise.all([
      api.getIntegrationProviders(),
      api.listIntegrationKeys(),
    ]);
    setProviders(providerList);
    setKeys(keyList);
    setNewProvider((current) =>
      current && providerList.some((p) => p.provider === current)
        ? current
        : providerList.find((p) => p.enabled)?.provider ?? providerList[0]?.provider ?? ''
    );
  };

  useEffect(() => {
    if (!active) return;
    setLoadFailed(false);
    setError(null);
    setMinted(null);
    setConfirmRevokeId(null);
    reload().catch(() => setLoadFailed(true));
  }, [active]);

  const createKey = async () => {
    if (!newProvider) return;
    setCreating(true);
    setError(null);
    try {
      const mintedKey = await api.createIntegrationKey({
        provider: newProvider,
        name: newName.trim() || undefined,
      });
      setMinted(mintedKey);
      setNewName('');
      setKeys(await api.listIntegrationKeys());
      toast({ title: 'Integration key created' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the key');
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    setError(null);
    try {
      await api.revokeIntegrationKey(id);
      setKeys(await api.listIntegrationKeys());
      toast({ title: 'Key revoked' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the key');
    } finally {
      setConfirmRevokeId(null);
    }
  };

  const copyToken = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.token);
      toast({ title: 'Token copied to clipboard' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not copy',
        description: 'Select the token below and copy it manually.',
      });
    }
  };

  const providerLabel = (slug: string) =>
    providers?.find((p) => p.provider === slug)?.label ?? slug;

  return (
    <section className="space-y-3 rounded-lg border p-3" style={line} aria-label="Integration settings">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#EDF4F0]">
          <Plug className="h-3.5 w-3.5 text-[#3E6355]" aria-hidden />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Integrations</h3>
      </div>

      {loadFailed ? (
        <p className="text-xs text-destructive">Could not load integration settings. Please try again.</p>
      ) : !providers || !keys ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading&hellip;
        </p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            External systems such as DocArchitect connect to Kala with a personal API key. A key acts as
            <span className="font-medium text-foreground"> you</span>: it can only see and change boards you have access to.
          </p>

          {/* What this server has configured */}
          {providers.length === 0 ? (
            <div className="rounded-md bg-[#F2F1ED] p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              No integrations are configured on this server yet. An administrator enables one with the
              <code className="mx-1 rounded bg-white px-1 py-0.5">INTEGRATION_&lt;PROVIDER&gt;_*</code>
              environment variables &mdash; see the README&rsquo;s Integration API section.
            </div>
          ) : (
            <ul className="space-y-1.5" aria-label="Configured providers">
              {providers.map((p) => (
                <li key={p.provider} className="rounded-md bg-[#F5F4F1] px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.enabled ? 'bg-[#7FA693]' : 'bg-[#C9C5BA]'}`}
                      aria-hidden
                    />
                    <span className="truncate text-xs font-semibold text-foreground">{p.label}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{p.provider}</span>
                    <span className={`ml-auto shrink-0 text-[10px] font-medium ${p.enabled ? 'text-[#3E6355]' : 'text-muted-foreground'}`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {p.base_url ?? 'No base URL set'}
                    {' · '}
                    {p.webhook.configured
                      ? `webhooks: ${p.webhook.events.length} event${p.webhook.events.length === 1 ? '' : 's'}`
                      : 'no webhooks'}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Mint a key */}
          {providers.length > 0 && !minted && (
            <div className="space-y-1.5 border-t pt-3" style={line}>
              <Label htmlFor="integration-key-name" className="text-xs">Create an API key</Label>
              <div className="flex gap-2">
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger id="integration-key-provider" className="h-9 w-32 shrink-0 bg-white text-xs" aria-label="Provider">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.provider} value={p.provider} disabled={!p.enabled}>
                        {p.label}{p.enabled ? '' : ' (disabled)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="integration-key-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (optional)"
                  maxLength={60}
                  className="h-9 bg-white text-xs"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void createKey()}
                disabled={creating || !newProvider}
                className="h-8 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]"
              >
                {creating ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> Creating&hellip;</>
                ) : (
                  <><Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Create key</>
                )}
              </Button>
            </div>
          )}

          {/* One-time token display */}
          {minted && (
            <div className="space-y-2 rounded-md border border-[#C9DCD2] bg-[#EDF4F0] p-2.5" role="status">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3E6355]">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Key &ldquo;{minted.name}&rdquo; created for {providerLabel(minted.provider)}
              </div>
              <p className="text-[11px] leading-snug text-[#3E6355]">
                This token is shown <span className="font-semibold">only once</span>. Store it now &mdash; Kala keeps
                only its hash and cannot show it again.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-[11px] text-foreground" title={minted.token}>
                  {minted.token}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyToken()} className="h-7 shrink-0 bg-white px-2 text-xs">
                  <Copy className="mr-1 h-3 w-3" aria-hidden /> Copy
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMinted(null)} className="h-7 text-xs">
                Done
              </Button>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/25 bg-destructive/[0.06] px-2 py-1.5 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* The user's keys */}
          <div className="space-y-1.5 border-t pt-3" style={line}>
            <h4 className="text-xs font-semibold text-foreground">Your keys</h4>
            {keys.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">You have not created any integration keys yet.</p>
            ) : (
              <ul className="space-y-1.5" aria-label="Your integration keys">
                {keys.map((key) => (
                  <li key={key.id} className="flex items-center gap-2 rounded-md bg-[#F5F4F1] px-2.5 py-2">
                    <div className={`min-w-0 flex-1 ${key.revoked ? 'opacity-60' : ''}`}>
                      <p className="truncate text-xs font-medium text-foreground">
                        {key.name}
                        <span className="ml-1.5 font-normal text-muted-foreground">&middot; {providerLabel(key.provider)}</span>
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        <code>{key.token_prefix}&hellip;</code>
                        {' · created '}{formatDate(key.created_at)}
                        {' · used '}{formatLastUsed(key.last_used_at)}
                      </p>
                    </div>
                    {key.revoked ? (
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Revoked</span>
                    ) : confirmRevokeId === key.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void revokeKey(key.id)}
                          className="h-6 bg-destructive px-2 text-[10px] text-destructive-foreground hover:bg-destructive/90"
                        >
                          Confirm
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmRevokeId(null)} className="h-6 w-6" aria-label="Cancel revoke">
                          <X className="h-3 w-3" />
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRevokeId(key.id)}
                        className="h-6 shrink-0 bg-white px-2 text-[10px] text-muted-foreground hover:text-destructive"
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Keys appear here only for your account. Revoking takes effect immediately.
            <Link2 className="mx-1 inline h-3 w-3 align-[-2px]" aria-hidden />
            See the README for endpoints, webhook signing and rate limits.
          </p>
        </>
      )}
    </section>
  );
}
