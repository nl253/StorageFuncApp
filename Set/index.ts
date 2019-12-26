import {
  fail,
  getBlobContainer,
  Headers,
  logStart,
  Response,
  succeed,
  TEXT_HEADER,
} from "../lib";

import {BlockBlobTier} from "@azure/storage-blob";

import {Context, HttpRequest} from "@azure/functions";

const setBlob = async (key: string, val: any, headers: Headers = {}): Promise<void> => {
  const container = getBlobContainer(process.env.REACT_APP_BLOB_CONTAINER);
  const blobHTTPHeaders = {
    blobCacheControl: headers["cache-control"],
    blobContentDisposition: headers["content-disposition"],
    blobContentEncoding: headers["content-encoding"],
    blobContentLanguage: headers["content-language"],
    blobContentType: headers["content-type"],
  };
  const options = {
    blobHTTPHeaders,
    tier: BlockBlobTier.Cool,
  };
  await (await container).uploadBlockBlob(key, val, val.length, options);
};

export default async (context: Context, req: HttpRequest): Promise<Response> => {
  logStart(context);
  try {
    const {key} = context.bindingData;
    await setBlob(key, req.rawBody, req.headers);
    return succeed(context, `"${key}" saved`, {...TEXT_HEADER});
  } catch (e) {
    return fail(context, e.message, e.code);
  }
};
