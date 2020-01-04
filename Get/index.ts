import { Context } from '@azure/functions';

import {
  APIError,
  fail,
  getBlob,
  IHttpFailure,
  IHttpJsonResponse,
  IHttpTextResponse,
  logStart,
  succeedJson,
} from '../lib';

type Response = Promise<IHttpJsonResponse | IHttpTextResponse | IHttpFailure>;

export default async (context: Context): Response => {
  logStart(context);
  try {
    const {
      res,
      headers,
    } = await getBlob(context.bindingData.key, context.req.headers.authorization);
    return succeedJson(context, res, headers);
  } catch (e) {
    return fail(context, APIError.from(e));
  }
};
