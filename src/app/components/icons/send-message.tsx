import type { SVGProps } from 'react';

export function SendMessage({ title = 'Send message', ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg aria-hidden={title ? undefined : true} height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      <path d="M11.854.146A.5.5,0,0,0,11.329.03l-11,4a.5.5,0,0,0-.015.934l4.8,1.921,1.921,4.8A.5.5,0,0,0,7.5,12h.008a.5.5,0,0,0,.462-.329l4-11A.5.5,0,0,0,11.854.146Z" fill="currentColor" />
    </svg>
  );
}
