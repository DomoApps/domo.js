export type AskRequestStatus = "pending" | "acknowledged" | "fulfilled" | "rejected" | "cancelled";
export type AskResponseStatus = "pending" | "fulfilled" | "rejected";

export interface AskReplyMap {
  [requestId: string]: {
    request: {
      payload: any;
      onAck?: Function;
      onReply?: Function;
      status: AskRequestStatus;
      sentAt?: number;
      ackAt?: number;
      repliedAt?: number;
    };
    response?: {
      payload?: any;
      status: AskResponseStatus;
      error?: Error;
      repliedAt?: number;
    };
  };
}