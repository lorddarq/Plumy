import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from 'sonner';
import { exportPdfDocument } from './pdfExport.ts';

test('exportPdfDocument reports actionable failures with a persistent toast', async () => {
  const previousWindow = globalThis.window;
  const errorToast = mock.method(toast, 'error');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      electron: {
        tasks: {
          exportPdf: async () => ({ success: false, canceled: false, error: 'The destination is read-only.' }),
        },
      },
    },
  });

  try {
    await exportPdfDocument({ html: '<main>Task</main>', defaultFileName: 'task.pdf', entityLabel: 'task' });

    assert.equal(errorToast.mock.calls.length, 1);
    assert.deepEqual(errorToast.mock.calls[0].arguments, [
      'PDF export failed',
      { description: 'The destination is read-only.', duration: 10_000, closeButton: true },
    ]);
  } finally {
    errorToast.mock.restore();
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
  }
});
