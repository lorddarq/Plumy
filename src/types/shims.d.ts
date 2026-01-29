// Declarations for third-party modules without types used by the project

declare module '@radix-ui/*';

declare module '@radix-ui/react-*';

declare module 'recharts' {
  export type LegendProps = any;
  export const Legend: any;
  export const ResponsiveContainer: any;
  export const XAxis: any;
  export const YAxis: any;
  export const CartesianGrid: any;
  export const Tooltip: any;
  export default any;
}

declare module 'embla-carousel-react' {
  export type UseEmblaCarouselType = any;
  export default function useEmblaCarousel(opts?: any, plugins?: any): [(el?: HTMLElement | null) => void, any];
}

declare module 'cmdk' { export const Command: any; export const CommandItem: any; export default any; }

declare module 'vaul' { export const Drawer: any; export default any; }

declare module 'react-day-picker' { export const DayPicker: any; export default any; }

declare module 'input-otp' { export const OTPInput: any; export const OTPInputContext: any; export default any; }

declare module 'next-themes' { export function useTheme(): any; }

declare module 'sonner' { export type ToasterProps = any; export const Toaster: any; export default any; }

declare module 'react-resizable-panels' { export const PanelGroup: any; export const Panel: any; export const PanelResizeHandle: any; export default any; }

declare module 'react-responsive-masonry' { const _default: any; export default _default; }

declare module 'react-slick' { const _default: any; export default _default; }

declare module 'react-hook-form' {
  export const Controller: any;
  export const FormProvider: any;
  export function useFormContext(): any;
  export function useFormState(...args: any[]): any;
  export type ControllerProps<T1 = any, T2 = any> = any;
  export type FieldPath<T> = any;
  export type FieldValues = any;
  export default any;
}
