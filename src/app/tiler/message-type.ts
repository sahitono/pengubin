export enum ToParentMessageType {
  INIT = "init:success",
  INIT_FAILED = "init:failed",

  CLOSE_SUCCESS = "close:success",
  CLOSE_FAILED = "close:failed",

  CREATE_SUCCESS = "create:success",
  CREATE_FAILED = "create:failed",

  RENDER_SUCCESS = "render:success",
  RENDER_FAILED = "render:failed",
}

export enum FromParentMessageType {
  CREATE = "create",
  CLOSE = "close",
}

export interface WorkerMessage<T, D = unknown> {
  type: T
  data: D
}

export interface FromParentMessage<T = unknown> extends WorkerMessage<FromParentMessageType, T> {}
export interface ToParentMessage<T = unknown> extends WorkerMessage<ToParentMessageType, T> {}
