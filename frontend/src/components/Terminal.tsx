import { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import OutputLine from './OutputLine';
import PromptBar, { type PromptBarHandle } from './PromptBar';
import Tooltip from './Tooltip';
import type { SessionManager } from '../lib/sessionManager';
import { fetchTrialInfo } from '../lib/trialClient';

const MODELS = [
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

  const [trialInfo, setTrialInfo] = useState<{ cost_used: number; cost_limit: number } | null>(null);

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
  const estimatedMsgsLeft = budgetLeft != null ? Math.floor(budgetLeft / estimatedCostPerMsg) : null;

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
        height: '100vh',
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#252526',
          borderBottom: '1px solid #2d2d2d',
          padding: '4px 12px',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#4ec94e', fontWeight: 'bold', fontSize: '13px' }}>llm-terminal</span>

        <div
          style={{
            display: 'flex',
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
