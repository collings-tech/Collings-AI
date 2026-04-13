import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
      title="Copy code"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400">Copied</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    let codeText = String(children).replace(/\n$/, '');

    if (lang === 'json' || (!lang && !inline)) {
      try {
        const parsed = JSON.parse(codeText);
        codeText = JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON — leave as-is
      }
    }

    if (!inline && (match || codeText.includes('\n') || lang === 'json')) {
      return (
        <div className="my-3 rounded-xl overflow-hidden border border-gray-600/50">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-600/50">
            <span className="text-xs text-gray-400 font-mono">{lang || 'code'}</span>
            <CopyButton text={codeText} />
          </div>
          <SyntaxHighlighter
            style={oneDark}
            language={lang || 'text'}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderRadius: 0,
              background: '#1a1d27',
              fontSize: '0.8125rem',
              lineHeight: '1.6',
              padding: '1rem',
            }}
            {...props}
          >
            {codeText}
          </SyntaxHighlighter>
        </div>
      );
    }

    return (
      <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs font-mono text-brand-300" {...props}>
        {children}
      </code>
    );
  },
  p({ children }) { return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>; },
  strong({ children }) { return <strong className="font-semibold text-white">{children}</strong>; },
  em({ children }) { return <em className="italic text-gray-300">{children}</em>; },
  ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-1 pl-1">{children}</ul>; },
  ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-1 pl-1">{children}</ol>; },
  li({ children }) { return <li className="text-gray-200">{children}</li>; },
  h1({ children }) { return <h1 className="text-lg font-bold text-white mb-2 mt-3">{children}</h1>; },
  h2({ children }) { return <h2 className="text-base font-bold text-white mb-2 mt-3">{children}</h2>; },
  h3({ children }) { return <h3 className="text-sm font-semibold text-white mb-1.5 mt-2">{children}</h3>; },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-brand-500 pl-3 my-2 text-gray-400 italic">
        {children}
      </blockquote>
    );
  },
  hr() { return <hr className="border-gray-600 my-3" />; },
  a({ href, children }) {
    return (
      <a href={href} className="text-brand-400 hover:text-brand-300 underline" target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-xl border border-gray-600/50">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-gray-800 border-b border-gray-600/50">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody>{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="border-b border-gray-700/40 last:border-0 hover:bg-gray-700/20 transition-colors">{children}</tr>;
  },
  th({ children }) {
    return <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{children}</th>;
  },
  td({ children }) {
    return <td className="px-4 py-2.5 text-gray-200 whitespace-nowrap">{children}</td>;
  },
};

function renderUserContent(content) {
  const lines = content.split('\n');
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

export default function ChatBubble({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%]">
          {message.attachments?.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 mb-1.5">
              {message.attachments.map((att, i) =>
                att.type.startsWith('image/') ? (
                  <img
                    key={i}
                    src={att.dataUrl}
                    alt={att.name}
                    className="max-h-48 max-w-xs rounded-xl border border-brand-500/40 object-cover shadow-lg"
                  />
                ) : (
                  <div key={i} className="flex items-center gap-1.5 bg-brand-700/60 border border-brand-500/40 rounded-xl px-3 py-2">
                    <svg className="w-4 h-4 text-brand-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-brand-200 max-w-[160px] truncate">{att.name}</span>
                  </div>
                )
              )}
            </div>
          )}
          {message.content && (
            <div className="bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-lg shadow-brand-900/30">
              {renderUserContent(message.content)}
            </div>
          )}
          {message.timestamp && (
            <p className="text-right text-xs text-gray-600 mt-1 pr-1">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4 gap-3">
      <img src="/collings-logo-solo.png" alt="Collings AI" className="flex-shrink-0 w-8 h-8 rounded-xl mt-1 shadow-md object-cover" />
      <div className="max-w-[80%] min-w-0">
        <div className="bg-gray-700 border border-gray-600 text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-md overflow-hidden">
          <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
        {message.timestamp && (
          <p className="text-xs text-gray-600 mt-1 pl-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
