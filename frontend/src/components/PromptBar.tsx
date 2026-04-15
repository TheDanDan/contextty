import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';

interface Props {
  ps1: string;
  isBusy: boolean;
  history: string[];
  historyIdxRef: MutableRefObject<number>;
  savedInputRef: MutableRefObject<string>;
  onSubmit: (command: string) => void;
}

export interface PromptBarHandle {
  focus: () => void;
}

const PromptBar = forwardRef<PromptBarHandle, Props>(function PromptBar(
  { ps1, isBusy, history, historyIdxRef, savedInputRef, onSubmit },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    if (!isBusy) {
      inputRef.current?.focus();
    }
  }, [isBusy]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const input = inputRef.current!;

    if (e.key === 'Enter') {
      const value = input.value;
      input.value = '';
      historyIdxRef.current = -1;
      onSubmit(value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      if (historyIdxRef.current === -1) {
        savedInputRef.current = input.value;
        historyIdxRef.current = history.length - 1;
      } else if (historyIdxRef.current > 0) {
        historyIdxRef.current--;
      }
      input.value = history[historyIdxRef.current];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdxRef.current === -1) return;
      if (historyIdxRef.current < history.length - 1) {
        historyIdxRef.current++;
        input.value = history[historyIdxRef.current];
      } else {
        historyIdxRef.current = -1;
        input.value = savedInputRef.current;
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      input.value = '';
      historyIdxRef.current = -1;
      onSubmit('^C');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      onSubmit('clear');
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        backgroundColor: '#1e1e1e',
        borderTop: '1px solid #2d2d2d',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: '#4ec94e',
          fontWeight: 'bold',
          whiteSpace: 'pre',
          opacity: isBusy ? 0.5 : 1,
          userSelect: 'none',
        }}
      >
        {ps1}
      </span>
      <input
        ref={inputRef}
        disabled={isBusy}
        onKeyDown={handleKeyDown}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#d4d4d4',
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: '14px',
          caretColor: '#d4d4d4',
          minWidth: 0,
        }}
      />
      {isBusy && (
        <span
          style={{
            color: '#6a9955',
            fontSize: '11px',
            marginLeft: '8px',
            flexShrink: 0,
          }}
        >
          …
        </span>
      )}
    </div>
  );
});

export default PromptBar;
