import { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import OutputLine from './OutputLine';
import PromptBar, { type PromptBarHandle } from './PromptBar';
import Tooltip from './Tooltip';
import type { SessionManager } from '../lib/sessionManager';
import { fetchTrialInfo } from '../lib/trialClient';

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#252526',
          border: '1px solid #3c3c3c',
          borderRadius: '8px',
          padding: '28px 32px',
          maxWidth: '520px',
          width: '100%',
          fontFamily: "'Courier New', Courier, monospace",
          position: 'relative',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '14px',
            background: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
            padding: '2px 6px',
          }}
        >
          ×
        </button>

        {/* Title */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ color: '#4ec94e', fontWeight: 'bold', fontSize: '22px' }}>$ </span>
          <span style={{ color: '#d4d4d4', fontWeight: 'bold', fontSize: '22px' }}>contextty</span>
        </div>

        <p style={{ color: '#9d9d9d', fontSize: '13px', lineHeight: '1.7', marginBottom: '18px' }}>
          A stateful Unix shell that lives in your browser — powered by Google Gemini. Type real
          shell commands and get back real output, with the AI keeping track of your working
          directory, environment variables, and session history across every message.
        </p>

        <p style={{ color: '#6a9955', fontSize: '12px', lineHeight: '1.7', marginBottom: '20px' }}>
          See what happens when you let an LLM pretend to be a Unix shell. It's not a real OS, just
          a stateful conversational interface that plays along with shell commands and tries to keep
          track of context.
        </p>

        {/* Tech stack */}
        <div
          style={{
            borderTop: '1px solid #3c3c3c',
            paddingTop: '16px',
          }}
        >
          <p
            style={{
              color: '#569cd6',
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            Built with
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              'React + TypeScript',
              'Vite',
              'Google Gemini 2.5',
              'Go (Gin)',
              'Redis',
              'Firebase Auth',
            ].map((tech) => (
              <span
                key={tech}
                style={{
                  backgroundColor: '#1e1e1e',
                  border: '1px solid #3c3c3c',
                  borderRadius: '4px',
                  color: '#dcdcaa',
                  fontSize: '11px',
                  padding: '3px 9px',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MODELS = [
  { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
];

interface Props {
  apiKey: string;
  model: string;
  session: SessionManager;
  isTrial: boolean;
  onChangeKey: () => void;
  onChangeModel: (model: string) => void;
}

export default function Terminal({ model, session, isTrial, onChangeKey, onChangeModel }: Props) {
  const {
    entries,
    isBusy,
    history,
    ps1,
    usage,
    historyIdxRef,
    savedInputRef,
    sendCommand: baseSendCommand,
    resetSession,
  } = useTerminal({ session });

  const sendCommand = (cmd: string) => {
    isAtBottomRef.current = true;
    baseSendCommand(cmd);
  };

  const CONTEXT_LIMIT = 200000;
  const contextPct = Math.min(100, (usage.activeTokens / CONTEXT_LIMIT) * 100);

  const [trialInfo, setTrialInfo] = useState<{ cost_used: number; cost_limit: number } | null>(
    null
  );

  useEffect(() => {
    if (!isTrial) return;
    fetchTrialInfo().then(setTrialInfo);
  }, [isTrial, usage.messageCount]);

  const budgetPct = trialInfo
    ? Math.min(100, (trialInfo.cost_used / trialInfo.cost_limit) * 100)
    : 0;
  const budgetLeft = trialInfo ? Math.max(0, trialInfo.cost_limit - trialInfo.cost_used) : null;
  // Estimate msgs remaining: use observed burn rate if available, else ~$0.001/msg for flash models
  const estimatedCostPerMsg = usage.burnRate > 0 ? usage.burnRate : 0.001;
  const estimatedMsgsLeft =
    budgetLeft != null ? Math.floor(budgetLeft / estimatedCostPerMsg) : null;

  const [showAbout, setShowAbout] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const promptBarRef = useRef<PromptBarHandle>(null);
  const isAtBottomRef = useRef(true);

  // Detect if user has scrolled up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) {
      // Use a small threshold (10px) to determine if we are at the bottom
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      isAtBottomRef.current = atBottom;
    }
  };

  // Auto-scroll to bottom whenever entries update, if we were already at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      onClick={() => {
        if (!window.getSelection()?.toString()) {
          promptBarRef.current?.focus();
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#1e1e1e',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '14px',
        color: '#d4d4d4',
      }}
    >
      {/* Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          backgroundColor: '#252526',
          borderBottom: '1px solid #2d2d2d',
          padding: '4px 12px',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span
          onClick={() => setShowAbout(true)}
          style={{
            color: '#4ec94e',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title="About contextty"
        >
          contextty
        </span>

        <div
          style={{
            display: isMobile ? 'none' : 'flex',
            gap: '16px',
            fontSize: '11px',
            color: '#888',
            alignItems: 'center',
          }}
        >
          <Tooltip text="Total tokens used in this session">
            <div>
              <span style={{ color: '#569cd6' }}>tokens:</span>{' '}
              <span style={{ color: '#dcdcaa' }}>{usage.totalTokens.toLocaleString()}</span>
            </div>
          </Tooltip>

          <Tooltip
            text={`Active context usage: ${usage.activeTokens.toLocaleString()} / ${CONTEXT_LIMIT.toLocaleString()} tokens`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#569cd6' }}>context:</span>
              <div
                style={{
                  width: '60px',
                  height: '6px',
                  backgroundColor: '#333',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${contextPct}%`,
                    height: '100%',
                    backgroundColor:
                      contextPct > 90 ? '#f44336' : contextPct > 70 ? '#ff9800' : '#4ec94e',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span style={{ color: '#dcdcaa', minWidth: '35px' }}>{contextPct.toFixed(1)}%</span>
            </div>
          </Tooltip>

          {isTrial ? (
            <Tooltip text="Daily limit for trying it out. Resets daily. Estimate based on average message cost.">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#569cd6' }}>usage:</span>
                <div
                  style={{
                    width: '60px',
                    height: '6px',
                    backgroundColor: '#333',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${budgetPct}%`,
                      height: '100%',
                      backgroundColor:
                        budgetPct > 90 ? '#f44336' : budgetPct > 70 ? '#ff9800' : '#4ec94e',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span style={{ color: '#ce9178' }}>
                  {estimatedMsgsLeft != null ? `~${estimatedMsgsLeft} msgs left` : '…'}
                </span>
              </div>
            </Tooltip>
          ) : (
            <Tooltip
              text={`Total estimated cost: $${usage.estimatedCost.toFixed(6)}\nLast message: $${usage.lastCost.toFixed(6)}`}
            >
              <div>
                <span style={{ color: '#569cd6' }}>cost:</span>{' '}
                <span style={{ color: '#ce9178' }}>
                  ${usage.estimatedCost.toFixed(3)}
                  <span style={{ color: '#888', fontSize: '10px', marginLeft: '4px' }}>
                    (${usage.burnRate.toFixed(4)}/msg)
                  </span>
                </span>
              </div>
            </Tooltip>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifySelf: 'end' }}>
          {!isMobile && (
            <Tooltip text="Switch model">
              <select
                value={model}
                onChange={(e) => onChangeModel(e.target.value)}
                style={modelSelect}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Tooltip>
          )}
          <Tooltip text="Reset session">
            <button onClick={resetSession} style={toolbarBtn}>
              reset
            </button>
          </Tooltip>
          <Tooltip text={isTrial ? 'Sign out of trial' : 'Change API key'}>
            <button onClick={onChangeKey} style={toolbarBtn}>
              {isTrial ? 'sign out' : 'change key'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          scrollbarWidth: 'thin',
          scrollbarColor: '#3c3c3c #1e1e1e',
        }}
      >
        {entries.map((entry) => (
          <OutputLine key={entry.id} html={entry.html} />
        ))}
      </div>

      {/* Input bar */}
      <PromptBar
        ref={promptBarRef}
        ps1={ps1}
        isBusy={isBusy}
        history={history}
        historyIdxRef={historyIdxRef}
        savedInputRef={savedInputRef}
        onSubmit={sendCommand}
      />

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #3c3c3c',
  borderRadius: '3px',
  color: '#9d9d9d',
  cursor: 'pointer',
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '11px',
  padding: '2px 8px',
};

const modelSelect: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #3c3c3c',
  borderRadius: '3px',
  color: '#6a9955',
  cursor: 'pointer',
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '11px',
  padding: '2px 6px',
  outline: 'none',
};
