export interface PermissionResponseRequest {
  responseKind?: 'elicitation' | 'codex-approval';
  fields: Array<{ name: string; defaultValue?: unknown }>;
}

export function buildPermissionResponse(request: PermissionResponseRequest, action: 'accept' | 'decline', values: Record<string, unknown>) {
  if (request.responseKind === 'codex-approval') {
    return { decision: action === 'accept' ? 'accept' : 'decline' };
  }
  const content = action === 'accept'
    ? Object.fromEntries(request.fields.map(field => [field.name, values[field.name] ?? field.defaultValue ?? '']))
    : null;
  return { action, content, _meta: null };
}
