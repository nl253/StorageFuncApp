import {Context} from "@azure/functions";

import {
  BlobServiceClient,
  ContainerClient,
  StorageRetryPolicyType,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import * as Ajv from "ajv";

type Headers = Record<string, string>;
type Response = any;

const JSON_HEADER = {
  "content-type": "application/json",
};

const TEXT_HEADER = {
  "content-type": "text/plain",
};

const CACHE_HEADER = {
  "cache-control": "private, immutable",
};

const HTTP_ERR = {
  USER_ERR: 400,
  NOT_FOUND_ERR: 404,
};

class APIError extends Error {
  public readonly code: number;

  constructor(msg: string = "something went wrong", code: number = HTTP_ERR.USER_ERR) {
    super(msg);
    this.code = code;
  }
}

const logStart = (context: Context): void => {
  context.log("[Node.js HTTP %s FuncApp] %s", context.req.method, context.req.url);
  context.log("binding data", context.bindingData ? JSON.stringify(context.bindingData).substr(0, 200) : "undefined");
  context.log("body %s", context.req.body ? JSON.stringify(context.req.body).substr(0, 200) : "undefined");
  context.log("query %s", JSON.stringify(context.req.query).substr(0, 200));
};

const makeLogger = (context: Context) => ({
  log(...xs: any[]): void {
    return context.log(...xs);
  },
  warn(...xs: any[]): void {
    return context.log.warn(...xs);
  },
  error(...xs: any[]): void {
    return context.log.error(...xs);
  },
});

const succeed = (context: Context, body: Response, headers: Headers = { ...CACHE_HEADER, ...JSON_HEADER }, status: number = 200): Response => {
  return context.res = {
    body,
    status,
    isRaw: true,
    headers,
  };
};

const fail = (context: Context, msg: string, status: number = 400, headers: Headers = { ...TEXT_HEADER }): Response => {
  return context.res = {
    status,
    headers,
    body: msg,
  };
};

const validateJSON = (context: Context, schema: Record<string, any>, what: "body" | "query" = "body"): void => {
  if (context.req[what] === null || context.req[what] === undefined) {
    throw new APIError(`${what} is missing from the request`, HTTP_ERR.USER_ERR);
  }
  const validate = new Ajv({
    messages: true,
    verbose: true,
    allErrors: true,
    unicode: false,
    logger: makeLogger(context),
  }).compile({
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: schema.$id || schema.description,
    description: schema.description || schema.$id,
    ...schema,
  });
  const valid = validate(context.req[what]);
  if (!valid) {
    context.log(validate);
    context.log(validate.errors[0].params);
    throw new APIError(validate.errors.map((e) => `${e.dataPath} ${e.message} ${e.params ? JSON.stringify(e.params) : ""}`).join(", "), HTTP_ERR.USER_ERR);
  }
};

const getBlobContainer = async (containerName: string): Promise<ContainerClient> => {
  const sharedKeyCredential = new StorageSharedKeyCredential(
    process.env.REACT_APP_BLOB_ACCOUNT,
    process.env.REACT_APP_BLOB_ACCOUNT_KEY,
  );
  const blobStorage = new BlobServiceClient(
    `https://${process.env.REACT_APP_BLOB_ACCOUNT}.blob.core.windows.net`,
    sharedKeyCredential,
    {
      retryOptions: {
        maxTries: 3,
        maxRetryDelayInMs: 250,
        retryDelayInMs: 50,
        retryPolicyType: StorageRetryPolicyType.EXPONENTIAL,
        tryTimeoutInMs: 5000,
      },
    });
  const container = blobStorage.getContainerClient(containerName);
  if (!(await container.exists())) {
    await container.create();
  }
  return container;
};

const streamToString: (readonly: any) => Promise<string> = (readableStream) => new Promise((resolve, reject) => {
  const chunks = [];
  readableStream.on("data", (data) => chunks.push(data.toString()));
  readableStream.on("end", () => resolve(chunks.join("")));
  readableStream.on("error", reject);
});

export {
  Headers,
  Response,
  HTTP_ERR,
  TEXT_HEADER,
  JSON_HEADER,
  CACHE_HEADER,
  logStart,
  fail,
  succeed,
  validateJSON,
  APIError,
  getBlobContainer,
  streamToString,
};
