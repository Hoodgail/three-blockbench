export type BBModelWarningCode =
  | "UNSUPPORTED_ELEMENT"
  | "MISSING_ELEMENT"
  | "MISSING_GROUP"
  | "MISSING_TEXTURE"
  | "TEXTURE_LOAD_FAILED"
  | "INVALID_FACE"
  | "INVALID_KEYFRAME"
  | "MOLANG_FALLBACK"
  | "NEWER_FORMAT";

export interface BBModelWarning {
  code: BBModelWarningCode;
  message: string;
  path?: string;
}

export class BBModelError extends Error {
  public readonly path?: string;

  public constructor(message: string, path?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BBModelError";
    if (path !== undefined) this.path = path;
  }
}
