import type { Filter, Variable, MockConfig, LogEntry } from './types';
import { createPanel } from './panel';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Outbound message shapes sent by the SDK via window.parent.postMessage
interface OutboundFilterMsg  { event: 'filter';   requestId: string; filter?: Filter[];    pageStateUpdate?: boolean | null; }
interface OutboundVariableMsg { event: 'variable'; requestId: string; variables?: Variable[]; }
interface OutboundAppDataMsg  { event: 'appData';  requestId: string; appData?: string; }
interface OutboundNavigateMsg { event: 'navigate'; url: string; isNewWindow: boolean; }
type OutboundMsg = OutboundFilterMsg | OutboundVariableMsg | OutboundAppDataMsg | OutboundNavigateMsg;

const OUTBOUND_EVENTS = new Set(['filter', 'variable', 'appData', 'navigate']);

export class DomoEmulator {
  private port2: MessagePort | null = null;
  private config: MockConfig;
  private log: LogEntry[] = [];
  private installed = false;
  private panel: ReturnType<typeof createPanel> | null = null;
  private boundOnMessage: (e: MessageEvent) => void;

  constructor(config: MockConfig = {}) {
    this.config = config;
    this.boundOnMessage = this.onMessage.bind(this);
  }

  install(): void {
    if (this.installed) return;
    // Only install when there is no real parent frame
    if (window.parent !== window) return;

    this.installed = true;
    window.addEventListener('message', this.boundOnMessage, { capture: true });

    // Wait for DOM to be ready before creating panel
    if (document.body) {
      this.initPanel();
    } else {
      document.addEventListener('DOMContentLoaded', () => this.initPanel());
    }
  }

  private initPanel(): void {
    const alias = this.config.dataAlias ?? 'default';
    const appData = this.config.appData ?? '{}';

    this.panel = createPanel({
      onSendFilters: () => {
        if (this.config.filters?.length) {
          this.pushFiltersUpdated(this.config.filters);
        }
      },
      onSendVariables: () => {
        if (this.config.variables?.length) {
          this.pushVariablesUpdated(this.config.variables);
        }
      },
      onSendDataUpdate: () => {
        this.pushDataUpdated(alias);
      },
      onSendAppData: () => {
        this.pushAppData(appData);
      },
    });
  }

  private onMessage(e: MessageEvent): void {
    let parsed: { event?: string } | null = null;
    try {
      parsed = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== 'object') return;

    const event = parsed.event;
    if (!event) return;

    // ── Inbound: SDK subscribing to receive messages ──────────────────────────
    if (event === 'subscribe' && e.ports[0]) {
      this.port2 = e.ports[0];
      // Prevent the SDK's legacy window handler from seeing its own subscribe
      e.stopImmediatePropagation();
      this.addLog('in', 'subscribe', parsed);
      const delay = this.config.initialDelayMs ?? 50;
      setTimeout(() => this.sendInitialState(), delay);
      return;
    }

    // ── Outbound: SDK sending requests to the platform ────────────────────────
    if (OUTBOUND_EVENTS.has(event)) {
      // Prevent the SDK's legacy window handler from processing the self-echo
      // that occurs because window.parent === window in standalone mode.
      e.stopImmediatePropagation();
      this.addLog('out', event, parsed);
      this.handleOutbound(parsed as OutboundMsg);
    }
  }

  // Simulate the platform roundtrip: ACK the request and push the inbound event.
  private handleOutbound(msg: OutboundMsg): void {
    if (!this.port2) return;

    const requestId = (msg as { requestId?: string }).requestId;

    // ACK the outbound request so the SDK's request tracker marks it acknowledged
    if (requestId) {
      this.port2.postMessage({ event: 'ack', requestId });
    }

    // Push back the corresponding inbound event
    if (msg.event === 'filter' && Array.isArray((msg as OutboundFilterMsg).filter)) {
      this.pushFiltersUpdated((msg as OutboundFilterMsg).filter!);
    } else if (msg.event === 'variable' && Array.isArray((msg as OutboundVariableMsg).variables)) {
      this.pushVariablesUpdated((msg as OutboundVariableMsg).variables!);
    } else if (msg.event === 'appData' && (msg as OutboundAppDataMsg).appData !== undefined) {
      this.pushAppData(String((msg as OutboundAppDataMsg).appData));
    }
    // navigate: fire-and-forget, no inbound roundtrip
  }

  pushFiltersUpdated(filters: Filter[]): void {
    if (!this.port2) return;
    const ackChannel = new MessageChannel();
    const requestId = uuid();
    ackChannel.port1.onmessage = (e: MessageEvent) => {
      this.addLog('in', 'ack:filtersUpdated', e.data);
    };
    this.port2.postMessage(
      { event: 'filtersUpdated', filters, requestId },
      [ackChannel.port2],
    );
    this.addLog('in', 'filtersUpdated', { filters, requestId });
  }

  pushVariablesUpdated(variables: Variable[]): void {
    if (!this.port2) return;
    const ackChannel = new MessageChannel();
    const requestId = uuid();
    ackChannel.port1.onmessage = (e: MessageEvent) => {
      this.addLog('in', 'ack:variablesUpdated', e.data);
    };
    this.port2.postMessage(
      { event: 'variablesUpdated', variables, requestId },
      [ackChannel.port2],
    );
    this.addLog('in', 'variablesUpdated', { variables, requestId });
  }

  pushDataUpdated(alias: string): void {
    if (!this.port2) return;
    const ackChannel = new MessageChannel();
    const requestId = uuid();
    ackChannel.port1.onmessage = (e: MessageEvent) => {
      this.addLog('in', 'ack:dataUpdated', e.data);
    };
    this.port2.postMessage(
      { event: 'dataUpdated', alias, requestId },
      [ackChannel.port2],
    );
    this.addLog('in', 'dataUpdated', { alias, requestId });
  }

  pushAppData(appData: string): void {
    if (!this.port2) return;
    const ackChannel = new MessageChannel();
    const requestId = uuid();
    ackChannel.port1.onmessage = (e: MessageEvent) => {
      this.addLog('in', 'ack:appData', e.data);
    };
    this.port2.postMessage(
      { event: 'appData', appData, requestId },
      [ackChannel.port2],
    );
    this.addLog('in', 'appData', { appData, requestId });
  }

  private sendInitialState(): void {
    if (this.config.filters?.length) {
      this.pushFiltersUpdated(this.config.filters);
    }
    if (this.config.variables?.length) {
      this.pushVariablesUpdated(this.config.variables);
    }
    if (this.config.dataAlias) {
      this.pushDataUpdated(this.config.dataAlias);
    }
    if (this.config.appData) {
      this.pushAppData(this.config.appData);
    }
  }

  private addLog(dir: 'in' | 'out', event: string, payload: unknown): void {
    this.log.push({ dir, event, payload, at: Date.now() });
    this.panel?.updateLog(this.log);
  }

  getLog(): LogEntry[] {
    return [...this.log];
  }

  uninstall(): void {
    if (!this.installed) return;
    window.removeEventListener('message', this.boundOnMessage, { capture: true });
    this.panel?.remove();
    this.panel = null;
    this.installed = false;
  }
}
