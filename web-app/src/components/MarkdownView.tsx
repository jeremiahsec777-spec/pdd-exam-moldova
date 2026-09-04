import React from 'react';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  if (!content) return null;

  const renderInline = (text: string): React.ReactNode[] => {
    const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return tokens.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              background: 'var(--bg-tertiary)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: '0.9em'
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`ul-${elements.length}`} style={{ paddingLeft: '20px', margin: '8px 0' }}>
            {currentList.items.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: 1.55 }}>
                {item}
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} style={{ paddingLeft: '20px', margin: '8px 0' }}>
            {currentList.items.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: 1.55 }}>
                {item}
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    if (line.startsWith('#### ')) {
      flushList();
      elements.push(
        <h5 key={idx} style={{ margin: '14px 0 6px 0', fontSize: '1rem' }}>
          {renderInline(line.slice(5))}
        </h5>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={idx} style={{ margin: '16px 0 8px 0', fontSize: '1.1rem', color: 'var(--accent-primary-light)' }}>
          {renderInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={idx} style={{ margin: '20px 0 10px 0', fontSize: '1.25rem' }}>
          {renderInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(renderInline(line.slice(2)));
    } else if (/^\d+\.\s/.test(line)) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      const itemText = line.replace(/^\d+\.\s/, '');
      currentList.items.push(renderInline(itemText));
    } else {
      flushList();
      elements.push(
        <p key={idx} style={{ margin: '6px 0', lineHeight: 1.6 }}>
          {renderInline(line)}
        </p>
      );
    }
  });

  flushList();

  return <div className="markdown-view">{elements}</div>;
};
export default MarkdownView;
