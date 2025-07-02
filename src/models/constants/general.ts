/**
 * The DomoEvent object defines a set of constants representing
 * different event names used in the Domo class for event handling.
 */
export const DomoEvent = {
  appData: "appData",
  dataUpdated: "dataUpdated",
  filtersUpdated: "filtersUpdated",
  variablesUpdated: "variablesUpdated",
  ack: "ack",
} as const;

/**
 * The eventToListenerKey object maps event names to their corresponding listener
 * method names. This is used to route events received from the parent window
 * to the appropriate listener methods in the Domo class.
 */
export const eventToListenerMap: { [event in keyof Omit<typeof DomoEvent, 'ack'>]: string } = {
  [DomoEvent.appData]: "onAppDataUpdated",
  [DomoEvent.dataUpdated]: "onDataUpdated",
  [DomoEvent.filtersUpdated]: "onFiltersUpdated",
  [DomoEvent.variablesUpdated]: "onVariablesUpdated",
};

/**
 * Retrieves the current Ryuu session token from the global window object.
 *
 * @returns The session token as a string if available, otherwise undefined.
 */
export const getToken = (): string | undefined => (window as any)?.__RYUU_SID__;
