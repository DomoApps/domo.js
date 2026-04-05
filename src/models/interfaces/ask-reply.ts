export type AskRequestStatus = "pending" | "acknowledged" | "fulfilled" | "rejected" | "cancelled";
export type AskResponseStatus = "pending" | "fulfilled" | "rejected";

export type OnAckCallback = (payload: any) => void;
export type OnReplyCallback = (payload: any, error?: Error) => void;

export interface AskReplyMap {
  [requestId: string]: {
    request: {
      payload: any;
      onAck?: OnAckCallback;
      onReply?: OnReplyCallback;
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