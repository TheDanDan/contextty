import { useState } from 'react';
import { signInWithGoogle, signInWithGitHub } from '../lib/firebaseAuth';

interface Props {
  onKeySet: (apiKey: string, model: string) => void;
  onTrialStart: (model: string) => void;
}

export default function ApiKeyGate({ onKeySet, onTrialStart }: Props) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError('API key is required.');
      return;
    }
    localStorage.setItem('gemini_api_key', trimmed);
    localStorage.setItem('gemini_model', model);
    onKeySet(trimmed, model);
  }

  async function handleGoogleSignIn() {
    setAuthLoading(true);
    setAuthError('');
    try {
      await signInWithGoogle();
      onTrialStart(model);
    } catch (err) {
      setAuthError('Google sign-in failed. Please try again.');
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGitHubSignIn() {
    setAuthLoading(true);
    setAuthError('');
    try {
      await signInWithGitHub();
      onTrialStart(model);
    } catch (err) {
      setAuthError('GitHub sign-in failed. Please try again.');
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.prompt}>$</span>
          <span style={styles.title}> llm-terminal</span>
        </div>
        <p style={styles.subtitle}>
          A stateful Unix shell emulator powered by Google Gemini.
        </p>

        {/* Trial section */}
        <div style={styles.trialSection}>
          <p style={styles.trialHeading}>Try it free — 10 messages / day</p>
          <p style={styles.trialNote}>
            No API key needed. Sign in to start your trial. Requests are proxied through our
            server; your session context stays in your browser.
          </p>

          <div style={styles.model}>
            <label style={styles.label} htmlFor="trial-model">
              Model
            </label>
            <select
              id="trial-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ ...styles.input, cursor: 'pointer' }}
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash — faster, lower cost</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro — more capable</option>
            </select>
          </div>

          <div style={styles.authButtons}>
            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              style={{ ...styles.authButton, ...styles.googleButton }}
            >
              {authLoading ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <button
              onClick={handleGitHubSignIn}
              disabled={authLoading}
              style={{ ...styles.authButton, ...styles.githubButton }}
            >
              {authLoading ? 'Signing in…' : 'Sign in with GitHub'}
            </button>
          </div>

          {authError && <p style={styles.error}>{authError}</p>}
        </div>

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or use your own key</span>
          <div style={styles.dividerLine} />
        </div>

        {/* BYOK section */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label} htmlFor="apikey">
            Gemini API Key
          </label>
          <input
            id="apikey"
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError('');
            }}
            placeholder="AIza..."
            autoComplete="off"
            style={styles.input}
          />

          <label style={styles.label} htmlFor="byok-model">
            Model
          </label>
          <select
            id="byok-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...styles.input, cursor: 'pointer' }}
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash — faster, lower cost</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro — more capable</option>
          </select>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button}>
            Launch Terminal
          </button>
        </form>

        <p style={styles.hint}>
          Get a free API key at{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            style={styles.link}
          >
            aistudio.google.com/apikey
          </a>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    fontFamily: "'Courier New', Courier, monospace",
    padding: '16px',
    overflowY: 'auto',
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#252526',
    border: '1px solid #3c3c3c',
    borderRadius: '6px',
    padding: '32px',
    margin: 'auto',
  },
  header: {
    marginBottom: '12px',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  prompt: {
    color: '#4ec94e',
  },
  title: {
    color: '#d4d4d4',
  },
  subtitle: {
    color: '#9d9d9d',
    fontSize: '13px',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  trialSection: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #3c3c3c',
    borderRadius: '4px',
    padding: '16px',
    marginBottom: '16px',
  },
  trialHeading: {
    color: '#4ec94e',
    fontSize: '13px',
    fontWeight: 'bold',
    marginBottom: '6px',
  },
  trialNote: {
    color: '#6a9955',
    fontSize: '11px',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  model: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '12px',
  },
  authButtons: {
    display: 'flex',
    gap: '8px',
  },
  authButton: {
    flex: 1,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '8px 4px',
    transition: 'opacity 0.15s',
  },
  googleButton: {
    backgroundColor: '#1a6b3a',
    color: '#d4d4d4',
  },
  githubButton: {
    backgroundColor: '#2d333b',
    color: '#d4d4d4',
    border: '1px solid #444c56',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#3c3c3c',
  },
  dividerText: {
    color: '#555',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    color: '#9cdcfe',
    fontSize: '12px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginTop: '8px',
  },
  input: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #3c3c3c',
    borderRadius: '4px',
    color: '#d4d4d4',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '14px',
    outline: 'none',
    padding: '8px 10px',
    width: '100%',
  },
  error: {
    color: '#f44747',
    fontSize: '12px',
    marginTop: '4px',
  },
  button: {
    backgroundColor: '#0e6b3a',
    border: 'none',
    borderRadius: '4px',
    color: '#d4d4d4',
    cursor: 'pointer',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: '14px',
    fontWeight: 'bold',
    marginTop: '16px',
    padding: '10px',
    transition: 'background-color 0.15s',
  },
  hint: {
    color: '#6a9955',
    fontSize: '12px',
    marginTop: '20px',
    textAlign: 'center',
  },
  link: {
    color: '#4ec94e',
  },
};
