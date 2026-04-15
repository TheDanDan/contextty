interface Props {
  html: string;
}

// ansi-to-html escapes HTML entities before converting ANSI codes,
// so dangerouslySetInnerHTML is safe here.
export default function OutputLine({ html }: Props) {
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        lineHeight: 1.4,
        minHeight: '1em',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
