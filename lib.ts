import {Context} from "@azure/functions";

import {
  BlobServiceClient,
  ContainerClient,
  StorageRetryPolicyType,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

type StatusOk = 200 | 201 | 202;
type StatusError = 400 | 401 | 404;

type Headers = Record<string, string>;
type TypedHeader<K extends string> = Headers & { "content-type": K };
type Json = boolean | null | string | number | Record<string, JSON> | Json[];

interface IHttpResponse<T, S extends number, H extends string> {
  body: T;
  status: S;
  isRaw: true;
  headers: TypedHeader<H>;
}

type IHttpTextResponse = IHttpResponse<string, StatusOk, "text/plain">;
type IHttpJsonResponse<T extends Json = Json> = IHttpResponse<T, StatusOk, "application/json">;
type IHttpFailure = IHttpResponse<string, StatusError, "text/plain">;

const JSON_HEADER: TypedHeader<"application/json"> = {
  "content-type": "application/json",
};

const TEXT_HEADER: TypedHeader<"text/plain"> = {
  "content-type": "text/plain",
};

const CACHE_HEADER = {
  "cache-control": "private, immutable",
};

class APIError extends Error {
  public static from(error: Error, code: StatusError = 400): APIError {
    // @ts-ignore
    const status = error.code || error.status || error.statusCode || code;
    return new APIError(error.message, status);
  }

  public readonly code: StatusError;

  protected constructor(msg: string = "something went wrong", code: StatusError) {
    super(msg);
    this.code = code;
  }
}

const logStart = (context: Context): void => {
  context.log("%s %s", context.req.method, context.req.url);
  context.log("binding data", context.bindingData ? JSON.stringify(context.bindingData).substr(0, 200) : "undefined");
  context.log("body %s", context.req.body ? JSON.stringify(context.req.body).substr(0, 200) : "undefined");
  context.log("query %s", context.req.query ? JSON.stringify(context.req.query).substr(0, 200) : "undefined");
};

const succeedJson = <T extends Json>(context: Context, body: T, headers: Headers = {...CACHE_HEADER}, status: StatusOk = 200): IHttpJsonResponse<T> => {
  return context.res = {
    body,
    status: status as 200,
    isRaw: true as true,
    headers: {
      ...headers,
      ...JSON_HEADER,
    },
  };
};

const succeedText = (context: Context, body: string, headers: Headers = {...CACHE_HEADER}, status: StatusOk = 200): IHttpTextResponse => {
  return context.res = {
    body,
    status: status as 200,
    isRaw: true as true,
    headers: {
      ...headers,
      ...TEXT_HEADER,
    },
  };
};

const fail = (context: Context, error: APIError, headers: Headers = {}): IHttpFailure => {
  return context.res = {
    status: error.code,
    headers: {
      ...headers,
      ...TEXT_HEADER,
    },
    isRaw: true as true,
    body: error.message,
  };
};

const getBlobContainer = async (containerName: string): Promise<ContainerClient> => {
  const sharedKeyCredential = new StorageSharedKeyCredential(
    process.env.BLOB_ACCOUNT,
    process.env.BLOB_ACCOUNT_KEY,
  );
  const blobStorage = new BlobServiceClient(
    `https://${process.env.BLOB_ACCOUNT}.blob.core.windows.net`,
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

const getBlob = async (key: string, containerName: string): Promise<{ res: string, headers: Headers }> => {
  const container = await getBlobContainer(containerName);
  const blob = container.getBlockBlobClient(key);
  const propertiesPromise = blob.getProperties();
  const res = await blob.download(0, undefined, {maxRetryRequests: 3});
  const resString = streamToString(res.readableStreamBody);
  const properties = await propertiesPromise;
  const headers = {
    "content-disposition": properties.contentDisposition,
    "cache-control": properties.cacheControl,
    "content-encoding": properties.contentEncoding,
    "content-language": properties.contentLanguage,
    "content-type": properties.contentType,
  } as Headers;
  return {
    headers,
    res: await resString,
  };
};

const streamToString: (readonly: any) => Promise<string> = (readableStream) => new Promise((resolve, reject) => {
  const chunks = [];
  readableStream.on("data", (data) => chunks.push(data.toString()));
  readableStream.on("end", () => resolve(chunks.join("")));
  readableStream.on("error", reject);
});

export {
  Headers,
  TEXT_HEADER,
  JSON_HEADER,
  CACHE_HEADER,
  logStart,
  fail,
  succeedJson,
  succeedText,
  APIError,
  getBlobContainer,
  streamToString,
  getBlob,
  Json,
  IHttpFailure,
  IHttpJsonResponse,
  IHttpTextResponse,
};
