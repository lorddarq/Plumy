import type { SVGProps } from 'react';

export function ButtonStop({ title = 'Stop work', ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg aria-hidden={title ? undefined : true} height="12" width="12" {...props} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      {title ? <title>{title}</title> : null}
      <path d="M10,0H2A2,2,0,0,0,0,2v8a2,2,0,0,0,2,2h8a2,2,0,0,0,2-2V2A2,2,0,0,0,10,0Z" fill="currentColor" />
    </svg>
  );
}
