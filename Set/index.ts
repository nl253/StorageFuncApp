import { Context, HttpRequest } from '@azure/functions';
import { BlockBlobTier } from '@azure/storage-blob';

import {
  APIError,
  fail,
  getBlobContainer,
  Headers,
  IHttpFailure,
  IHttpTextResponse,
  logStart,
  succeedText,
} from '../lib';

const setBlob = async (
  key: string,
  val: string,
  containerName: string,
  headers: Headers,
): Promise<void> => {
  const container = getBlobContainer(containerName);
  const blobHTTPHeaders = {
    blobCacheControl: headers['cache-control'],
    blobContentDisposition: headers['content-disposition'],
    blobContentEncoding: headers['content-encoding'],
    blobContentLanguage: headers['content-language'],
    blobContentType: headers['content-type'],
  };
  const options = {
    blobHTTPHeaders,
    tier: BlockBlobTier.Cool,
  };
  await (await container).uploadBlockBlob(key, val, val.length, options);
};

export default async (
  context: Context,
  req: HttpRequest,
): Promise<IHttpTextResponse | IHttpFailure> => {
  logStart(context);
  try {
    const { key } = context.bindingData;
    const job = setBlob(
      key, req.rawBody, context.req.headers.authorization, req.headers as Headers,
    );
    const contentType = req.headers['content-type'] || 'text/plain';
    const msg = `"${key}" saved, ${req.rawBody.length} bytes, content type ${contentType}`;
    if (req.query.mode === 'sync') {
      await job;
    }
    return succeedText(context, msg);
  } catch (e) {
    return fail(context, APIError.from(e));
  }
};
