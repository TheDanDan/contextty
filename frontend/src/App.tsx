import { useState, useEffect, useMemo } from 'react';
import ApiKeyGate from './components/ApiKeyGate';
import Terminal from './components/Terminal';
import { GeminiClient } from './lib/geminiClient';
import { TrialClient } from './lib/trialClient';
import { SessionManager } from './lib/sessionManager';
import { onAuthStateChanged, signOut } from './lib/firebaseAuth';

type AppMode = 'gate' | 'byok' | 'trial';

function buildSession(mode: AppMode, apiKey: string, model: string): SessionManager | null {
  if (mode === 'byok' && apiKey) {
    return new SessionManager(new GeminiClient(apiKey, model));
  }
  if (mode === 'trial') {
    return new SessionManager(new TrialClient(model));
  }
  return null;
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') ?? '');
  const [model, setModel] = useState(
    () => localStorage.getItem('gemini_model') ?? 'gemini-2.5-flash-lite'
  );
  const [mode, setMode] = useState<AppMode>(() => {
    if (localStorage.getItem('gemini_api_key')) return 'byok';
    // Firebase auth state is async — start at 'gate', useEffect resolves it
    return 'gate';
  });

  // Check if a Firebase user is already signed in on mount (e.g. after page refresh)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      setMode((prev) => {
        if (user && prev === 'gate') return 'trial';
        if (!user && prev === 'trial') return 'gate';
        return prev;
      });
    });
    return unsubscribe;
  }, []);

  // Build session whenever mode/apiKey/model changes. Must be called unconditionally.
  const session = useMemo(() => buildSession(mode, apiKey, model), [mode, apiKey, model]);

  function handleKeySet(key: string, m: string) {
    setApiKey(key);
    setModel(m);
    setMode('byok');
  }

  function handleTrialStart(m: string) {
    setModel(m);
    setMode('trial');
  }

  function handleChangeKey() {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('gemini_model');
    setApiKey('');
    setMode('gate');
    // Sign out of Firebase if in trial mode (onAuthStateChanged will update mode)
    signOut().catch(() => {});
  }

  function handleChangeModel(m: string) {
    localStorage.setItem('gemini_model', m);
    setModel(m);
  }

  if (mode === 'gate' || !session) {
    return <ApiKeyGate onKeySet={handleKeySet} onTrialStart={handleTrialStart} />;
  }

  const isTrial = mode === 'trial';

  return (
    <Terminal
      apiKey={isTrial ? '' : apiKey}
      model={model}
      session={session}
      isTrial={isTrial}
      onChangeKey={handleChangeKey}
      onChangeModel={handleChangeModel}
    />
  );
}
