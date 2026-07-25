import {
  FileLoader,
  Loader,
  LoaderUtils,
  type LoadingManager,
} from "three";
import { BBModel } from "./BBModel.js";
import { BBModelParser } from "./BBModelParser.js";
import type { BBModelLoaderOptions } from "./options.js";
import { resolveOptions } from "./options.js";
import { parseBBModelDocument } from "./validation.js";

export class BBModelLoader extends Loader<BBModel> {
  private options: BBModelLoaderOptions;

  public constructor(manager?: LoadingManager, options: BBModelLoaderOptions = {}) {
    super(manager);
    this.options = options;
  }

  public setOptions(options: BBModelLoaderOptions): this {
    this.options = options;
    return this;
  }

  public override load(
    url: string,
    onLoad: (data: BBModel) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const basePath = this.resourcePath || LoaderUtils.extractUrlBase(`${this.path}${url}`);
    const fileLoader = new FileLoader(this.manager);
    fileLoader.setPath(this.path);
    fileLoader.setRequestHeader(this.requestHeader);
    fileLoader.setWithCredentials(this.withCredentials);
    fileLoader.setResponseType("text");
    fileLoader.load(
      url,
      (data) => {
        void this.parseAsync(data, basePath).then(onLoad).catch((error: unknown) => onError?.(error));
      },
      onProgress,
      onError,
    );
  }

  public parse(
    data: string | ArrayBuffer | unknown,
    path: string,
    onLoad: (model: BBModel) => void,
    onError?: (error: unknown) => void,
  ): void {
    void this.parseAsync(data, path).then(onLoad).catch((error: unknown) => onError?.(error));
  }

  public async parseAsync(data: string | ArrayBuffer | unknown, path = ""): Promise<BBModel> {
    const document = parseBBModelDocument(data);
    const parser = new BBModelParser(this.manager, resolveOptions(this.options));
    return parser.parse(document, path);
  }
}
