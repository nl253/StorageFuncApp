import {
  fail,
  getBlobContainer,
  Headers,
  logStart,
  Response,
  streamToString,
  succeed,
} from "../lib";

import {Context} from "@azure/functions";

const getBlob = async (key: string): Promise<{ res: string, headers: Headers }> => {
  const container = await getBlobContainer(process.env.BLOB_CONTAINER);
  const blob = container.getBlockBlobClient(key);
  const propertiesPromise = blob.getProperties();
  const res = await blob.download(0, undefined, {maxRetryRequests: 3});
  const resString = streamToString(res.readableStreamBody);
  const properties = await propertiesPromise;
  const headers = {
    "Content-disposition": properties.contentDisposition,
    "cache-control": properties.cacheControl,
    "content-encoding": properties.contentEncoding,
    "content-language": properties.contentLanguage,
    "content-type": properties.contentType,
  };
  return {
    headers,
    res: await resString,
  };
};

export default async (context: Context): Promise<Response> => {
  logStart(context);
  try {
    const { res, headers } = await getBlob(context.bindingData.key);
    return succeed(context, res, {"content-type": "text/plain", ...headers});
  } catch (e) {
    return fail(context, e.message, e.code);
  }
};
