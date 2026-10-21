import { body, handle } from '@/lib/server/http';
import { listPieces, listStyles, createPiece, workerStatus } from '@/lib/server/content-machine';
import { getSources, saveSources, type ResearchSources } from '@/lib/server/content-executor';
export async function GET(){return handle(()=>({pieces:listPieces(),styles:listStyles(),worker:workerStatus(),sources:getSources()}));}
export async function POST(req:Request){const b=await body<{title?:string;topic?:string;styleId?:string}>(req);return handle(()=>({piece:createPiece(b)}),201);}
export async function PATCH(req:Request){const b=await body<{sources:ResearchSources}>(req);return handle(()=>({sources:saveSources(b.sources)}));}
