const FAILURE_CLASSES = new Set(['unauthorized', 'forbidden', 'invalid_params', 'not_found', 'conflict', 'internal', 'unknown']);

function normalizeProviderDetail(value, maxLength = 240) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(?:authorization|www-authenticate|api[-_]?key|access[-_]?token|auth[-_]?token|password|secret|cookie)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
    .replace(/\/(?:Users|home|private|tmp)\/[^\s]+/g, '[path redacted]')
    .trim()
    .slice(0, maxLength);
}

function normalizeFailureClass(code, detail, outcome = 'failure') {
  if (outcome === 'success') return null;
  const value = `${typeof code === 'string' ? code : ''} ${typeof detail === 'string' ? detail : ''}`.toLowerCase();
  if (/unauthor|auth_required|token_expired/.test(value)) return 'unauthorized';
  if (/forbidden|access_disabled|write_tools_unavailable|permission_denied/.test(value)) return 'forbidden';
  if (/invalid|params|malformed|schema/.test(value)) return 'invalid_params';
  if (/not[_ -]?found|missing/.test(value)) return 'not_found';
  if (/conflict|revision|already_active|busy/.test(value)) return 'conflict';
  if (/internal|unavailable|timeout|transport|protocol|runtime/.test(value)) return 'internal';
  return 'unknown';
}

module.exports = { FAILURE_CLASSES, normalizeFailureClass, normalizeProviderDetail };
