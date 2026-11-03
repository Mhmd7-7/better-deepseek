// Shared only within the isolated content-script world. Page scripts cannot
// register a controller or grant permissions through DOM CustomEvents.
let controller = null;
export function registerWorkspace(controllerInstance) { controller = controllerInstance; }
export function claimWorkspaceMessage(node, text, latest, generating) {
  return controller?.claimMessage(node, text, latest, generating) || false;
}
export function observeWorkspaceUserMessage(node, text) { controller?.userMessage?.(node, text); }
