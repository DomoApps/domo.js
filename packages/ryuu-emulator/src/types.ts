export interface Filter {
  columnName: string;
  operator: string;
  values: string[];
  dataType: string;
}

export interface Variable {
  functionId: number;
  value: string;
}

export interface MockConfig {
  filters?: Filter[];
  variables?: Variable[];
  /** Dataset alias to emit on initial state and "Send Data Update" panel button. Default: 'default' */
  dataAlias?: string;
  /** App data string to emit on initial state and "Send App Data" panel button. */
  appData?: string;
  /** Milliseconds to wait after subscribe before sending initial state. Default: 50 */
  initialDelayMs?: number;
}

export interface LogEntry {
  dir: 'in' | 'out';
  event: string;
  payload: unknown;
  at: number;
}
