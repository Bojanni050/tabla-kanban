import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { AiSettings } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Settings -> Kala AI: each user picks an AI provider and model, and may save their own API key.
// The key goes to the server once and is stored encrypted; it is never sent back to the browser
// (the server only reports that a key exists and its last 4 characters).

const line = { borderColor: 'var(--kala-line)' };

export function AiSettingsSection({ active }: { active: boolean }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  // What the user typed in the model box since opening the list; the list only narrows once they type.
  const [modelFilter, setModelFilter] = useState('');

  // Fill the form from what the server says is currently chosen.
  const applySettings = useCallback((s: AiSettings) => {
    setSettings(s);
    const chosen = s.selection?.provider ?? s.serverDefault?.provider ?? s.providers[0]?.id ?? '';
    setProvider(chosen);
    const preset = s.providers.find((p) => p.id === chosen);
    setModel(s.selection?.model ?? (s.serverDefault?.provider === chosen ? s.serverDefault.model : null) ?? preset?.defaultModel ?? '');
    setApiKey('');
    setModels(null);
    setModelsError(null);
    setModelFilter('');
    window.dispatchEvent(new Event('kala-ai-settings-changed')); // the AI panel re-checks its status
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoadFailed(false);
    setError(null);
    api.getAiSettings().then(applySettings).catch(() => setLoadFailed(true));
  }, [active, applySettings]);

  const current = settings?.providers.find((p) => p.id === provider);
  const canBrowse = Boolean(current && (current.hasUserKey || current.hasServerKey));

  const changeProvider = (id: string) => {
    if (!settings) return;
    setProvider(id);
    setApiKey('');
    setError(null);
    setModels(null);
    setModelsError(null);
    setModelFilter('');
    const preset = settings.providers.find((p) => p.id === id);
    setModel(settings.selection?.provider === id ? settings.selection.model : preset?.defaultModel ?? '');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      applySettings(await api.saveAiSettings({ provider, model: model.trim(), apiKey: apiKey.trim() || undefined }));
      toast({ title: 'Kala AI settings saved' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToServerDefault = async () => {
    setSaving(true);
    setError(null);
    try {
      applySettings(await api.resetAiSettings());
      toast({ title: 'Using the server default' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your settings');
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    setSaving(true);
    setError(null);
    try {
      applySettings(await api.deleteAiKey(provider));
      toast({ title: 'Your API key was removed' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the key');
    } finally {
      setSaving(false);
    }
  };

  const browseModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    setModelFilter('');
    try {
      setModels((await api.listAiModels(provider)).models);
    } catch (e) {
      setModels(null);
      setModelsError(e instanceof Error ? e.message : 'Could not load the model list');
    } finally {
      setLoadingModels(false);
    }
  };

  const filteredModels = useMemo(() => {
    if (!models) return [];
    const q = modelFilter.trim().toLowerCase();
    return (q ? models.filter((m) => m.toLowerCase().includes(q)) : models).slice(0, 60);
  }, [models, modelFilter]);

  const effective = settings?.effective;
  const keyNote = !current
    ? ''
    : current.hasUserKey
      ? `Your own key ending in ${current.keyHint} is saved (stored encrypted).`
      : current.hasServerKey
        ? "This server has a shared key for this provider. It is used unless you add your own."
        : 'No API key yet. Paste yours below to use this provider.';

  return (
    <section className="space-y-3 rounded-lg border p-3" style={line} aria-label="Kala AI settings">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: 'var(--kala-coral-soft)' }}>
          <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--kala-coral-strong)' }} aria-hidden />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Kala AI</h3>
      </div>

      {loadFailed ? (
        <p className="text-xs text-destructive">Could not load your Kala AI settings. Please try again.</p>
      ) : !settings ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading&hellip;</p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground" role="status">
            {effective?.ok
              ? <>Currently using <span className="font-medium text-foreground">{effective.provider}</span> &middot; <span className="font-medium text-foreground">{effective.model}</span> ({effective.keySource === 'user' ? 'your key' : "the server's key"}).</>
              : 'Kala AI is not set up for you yet. Choose a provider and add your API key.'}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ai-provider" className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={changeProvider}>
              <SelectTrigger id="ai-provider" className="h-9 bg-white text-sm"><SelectValue placeholder="Choose a provider" /></SelectTrigger>
              <SelectContent>
                {settings.providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {current?.openaiCompatible && <p className="text-[11px] text-muted-foreground">Uses the OpenAI-compatible API.</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ai-model" className="text-xs">Model</Label>
              <button
                type="button"
                onClick={() => void browseModels()}
                disabled={!canBrowse || loadingModels}
                title={canBrowse ? undefined : 'Save an API key for this provider first'}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
              >
                {loadingModels ? 'Loading models…' : models ? 'Reload models' : 'Browse models'}
              </button>
            </div>
            <Input
              id="ai-model"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setModelFilter(e.target.value);
              }}
              placeholder={current?.defaultModel || 'Model id'}
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              className="h-9 bg-white text-sm"
            />
            {modelsError && <p className="text-[11px] text-destructive">{modelsError}</p>}
            {models && (
              <div className="max-h-36 overflow-y-auto rounded-md border bg-white" style={line} role="listbox" aria-label="Available models">
                {filteredModels.length === 0 ? (
                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">No model matches &ldquo;{modelFilter}&rdquo;. You can still use it as typed.</p>
                ) : (
                  filteredModels.map((m) => (
                    <button key={m} type="button" role="option" aria-selected={m === model} onClick={() => setModel(m)} className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-[#FAFAF8]">
                      {m}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {settings.canStoreKeys && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="ai-key" className="text-xs">Your API key</Label>
                {current?.keyHelpUrl && (
                  <a href={current.keyHelpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    Get a key <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </div>
              <Input
                id="ai-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={current?.hasUserKey ? 'Saved - paste a new key to replace it' : 'Paste your API key'}
                autoComplete="off"
                spellCheck={false}
                name="kala-ai-key"
                data-1p-ignore
                className="h-9 bg-white text-sm"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">{keyNote}</p>
            </div>
          )}

          {error && <p className="rounded-md border border-destructive/25 bg-destructive/[0.06] px-2 py-1.5 text-xs text-destructive" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !provider || !model.trim()} className="h-8 bg-[#2A2F36] text-xs text-white hover:bg-[#1E2329]">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {settings.selection && (
              <Button type="button" variant="outline" size="sm" onClick={() => void resetToServerDefault()} disabled={saving} className="h-8 bg-white text-xs">
                Use server default
              </Button>
            )}
            {current?.hasUserKey && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void removeKey()} disabled={saving} className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                Remove my key
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            When you use Kala AI, the content of the board you are asking about is sent to the provider you choose here.
          </p>
        </>
      )}
    </section>
  );
}
