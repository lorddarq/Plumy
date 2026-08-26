import ReactMarkdown, { Components } from 'react-markdown';
import { Children, isValidElement } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import remarkGfm from 'remark-gfm';
import { useWorkspaceSelector } from '../store/workspaceStore.tsx';
import { getMarkdownAppearanceCssVariables } from '../utils/markdownAppearance.ts';
import { TaskCheckboxIndicator } from './TaskCheckboxControl';

interface MarkdownContentProps {
  content: string;
}

type CodeComponentProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  node?: {
    properties?: {
      className?: string[] | string;
    };
  };
};

function isNestedListNode(node: ReactNode) {
  if (!isValidElement(node)) return false;
  if (node.type === 'ul' || node.type === 'ol') return true;

  const tagName = typeof node.props === 'object' && node.props !== null
    ? node.props.node?.tagName
    : undefined;
  return tagName === 'ul' || tagName === 'ol';
}

function flattenMarkdownText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenMarkdownText).join('');
  if (!isValidElement(node)) return '';
  return flattenMarkdownText(node.props?.children);
}

function openExternalLink(url: string) {
  if (typeof window === 'undefined') return;

  if (window.electron?.openExternal) {
    void window.electron.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="omvra-markdown-block break-words text-xl font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h1>,
  h2: ({ children }) => <h2 className="omvra-markdown-block break-words text-lg font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h2>,
  h3: ({ children }) => <h3 className="omvra-markdown-block break-words text-base font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h3>,
  h4: ({ children }) => <h4 className="omvra-markdown-block break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h4>,
  h5: ({ children }) => <h5 className="omvra-markdown-block break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h5>,
  h6: ({ children }) => <h6 className="omvra-markdown-block break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">{children}</h6>,
  p: ({ children }) => <p className="omvra-markdown-block break-words text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{children}</p>,
  ul: ({ children }) => <ul className="omvra-markdown-content-list omvra-markdown-content-list-unordered min-w-0">{children}</ul>,
  ol: ({ children }) => <ol className="omvra-markdown-content-list omvra-markdown-content-list-ordered min-w-0">{children}</ol>,
  li: ({ children, className }) => {
    const isTaskItem = className?.includes('task-list-item');
    if (!isTaskItem) {
      return <li className="omvra-markdown-list-item min-w-0 break-words text-sm text-gray-800 [overflow-wrap:anywhere]">{children}</li>;
    }

    const childNodes = Children.toArray(children);
    const nestedLists = childNodes.filter(isNestedListNode);
    const rowNodes = childNodes.filter((child) => !isNestedListNode(child));
    const [checkboxNode, ...contentNodes] = rowNodes;

    return (
      <li className="omvra-markdown-list-item omvra-markdown-task-list-item min-w-0 list-none text-sm text-gray-800 [overflow-wrap:anywhere]">
        <span className="omvra-markdown-task-list-row flex min-w-0 items-start gap-2">
          {checkboxNode}
          <span className="omvra-markdown-task-list-content min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
            {contentNodes}
          </span>
        </span>
        {nestedLists.length > 0 ? (
          <div className="omvra-markdown-task-list-children min-w-0">
            {nestedLists}
          </div>
        ) : null}
      </li>
    );
  },
  input: ({ type, checked, disabled }) => {
    if (type !== 'checkbox') return null;
    return (
      <span className="mt-0.5">
        <TaskCheckboxIndicator checked={Boolean(checked)} disabled={disabled ?? true} />
      </span>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="omvra-markdown-block min-w-0 break-words border-l-2 border-gray-300 pl-3 text-sm text-gray-700 [overflow-wrap:anywhere]">{children}</blockquote>
  ),
  pre: ({ children }) => {
    const textContent = flattenMarkdownText(children).replace(/\n$/, '');
    return (
      <div className="omvra-markdown-block omvra-markdown-preformatted-text max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
        {textContent}
      </div>
    );
  },
  code: ({ inline, className, children, node }: CodeComponentProps) => {
    const nodeClassName = node?.properties?.className;
    const normalizedClassName = Array.isArray(nodeClassName)
      ? nodeClassName.join(' ')
      : (nodeClassName || className || '');
    const childText = typeof children === 'string' ? children : String(children ?? '');
    const isBlockCode = Boolean(inline === false || normalizedClassName || childText.includes('\n'));

    if (!isBlockCode) {
      return (
        <code className="omvra-markdown-inline-code font-mono text-xs [overflow-wrap:anywhere]">
          {children}
        </code>
      );
    }

    return <code className={normalizedClassName}>{children}</code>;
  },
  a: ({ href, children }) => {
    const safeHref = href || '';
    const isSafe =
      safeHref.startsWith('http://') ||
      safeHref.startsWith('https://') ||
      safeHref.startsWith('mailto:');
    if (!isSafe) return <span>{children}</span>;
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          openExternalLink(safeHref);
        }}
        className="break-words text-blue-600 underline [overflow-wrap:anywhere]"
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="omvra-markdown-block max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="break-words border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium [overflow-wrap:anywhere]">{children}</th>,
  td: ({ children }) => <td className="break-words border border-gray-200 px-2 py-1 [overflow-wrap:anywhere]">{children}</td>,
  hr: () => <hr className="omvra-markdown-block border-gray-200" />,
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  const markdownAppearance = useWorkspaceSelector(state => state.preferences.markdownAppearance);

  return (
    <div
      className="omvra-markdown-content min-w-0 max-w-full overflow-hidden"
      style={getMarkdownAppearanceCssVariables(markdownAppearance)}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
