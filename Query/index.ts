import {Context} from "@azure/functions";

import {
  APIError,
  fail,
  getBlob,
  getBlobContainer,
  IHttpFailure,
  IHttpJsonResponse,
  Json,
  logStart, succeedJson,
} from "../lib";

const LIST_OPTIONS = {
  includeCopy: false,
  includeDeleted: false,
  includeMetadata: false,
  includeUncommitedBlobs: false,
  includeSnapshots: false,
};

const TAKE = 1000;

interface IQueryParams<T extends Json = Json> {
  where: string;
  val: T;
  op: "===" | "==" | "<" | ">" | ">=" | "<=";
  take: number;
  offset: number;
}

const getBlobs = async <T extends Json = Json, K extends Json = Json>(containerName: string, query: Partial<IQueryParams<K>>): Promise<T[]> => {
  // noinspection JSUnusedLocalSymbols
  const {
    where,
    val,
    op = "===",
    take = TAKE.toString(),
    offset = "0",
  } = query;
  const container = await getBlobContainer(containerName);
  if (where === undefined) {
    const promises: Array<Promise<T>> = [];
    let j = 0;
    for await (const b of container.listBlobsFlat(LIST_OPTIONS)) {
      // @ts-ignore
      // tslint:disable-next-line:radix
      if (promises.length > parseInt(take)) {
        break;
      }
      // @ts-ignore
      // tslint:disable-next-line:radix
      if (j >= parseInt(offset)) {
        promises.push(getBlob(b.name, containerName).then(({ res }): T => JSON.parse(res) as T));
      }
      j++;
    }
    return await Promise.all(promises);
  }
  const blobs = [];
  let i = 0;
  for await (const b of container.listBlobsFlat(LIST_OPTIONS)) {
    // @ts-ignore
    // tslint:disable-next-line:radix
    if (blobs.length > parseInt(take)) {
      break;
    }
    if (i >= offset) {
      const item = JSON.parse((await getBlob(b.name, containerName)).res);
      // tslint:disable-next-line:no-eval
      if (eval(`item[where] ${op} JSON.parse(val)`)) {
        blobs.push(item);
      }
    }
    i++;
  }
  return blobs;
};

export default async (context: Context): Promise<IHttpJsonResponse<Json[]> | IHttpFailure> => {
  logStart(context);
  try {
    const blobs = await getBlobs(context.req.headers.authorization, context.req.query);
    const msg = JSON.stringify(blobs) as unknown as Json[];
    return succeedJson<Json[]>(context, msg);
  } catch (e) {
    return fail(context, APIError.from(e));
  }
};
