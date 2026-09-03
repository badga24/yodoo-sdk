import { SyncProtocolError } from "./errors.js";
import type {
  SyncCatalogueDTO,
  SyncEventDTO,
  SyncMainSnapshot,
  SyncOfferDTO,
  SyncOthersSnapshot,
} from "./types.js";

/**
 * Parseurs des flux NDJSON de synchronisation (docs/apis/apps/locale.md §7, yodoo_back).
 *
 * Deux flux, même structure : `meta` (1re ligne, `counts` = domaines de ce flux) → lignes de
 * données → `end` (dernière ligne, `version` + `records`). Lu **au fil de l'eau** (jamais
 * `JSON.parse` du corps entier). Toute anomalie (ligne `end` absente, compteurs incohérents
 * avec `meta.counts`, ligne illisible, type inattendu pour ce flux, donnée après `end`) lève
 * une `SyncProtocolError` : l'appelant garde alors sa version précédente **de ce flux**.
 *
 *   /locale/app/v2/sync/main   -> `catalogue`×N puis `offer`×N
 *   /locale/app/v2/sync/others -> `content` (exactement 1) puis `event`×N
 */

interface MetaLine {
  type: "meta";
  generatedAt: string;
  counts: Record<string, number>;
}

interface EndLine {
  type: "end";
  version: string;
  records: number;
}

/** Itère les chunks d'octets d'une `Response`, via un reader (async-iteration de `ReadableStream` non garantie sur Node 18). */
async function* readResponseChunks(
  response: Response
): AsyncGenerator<Uint8Array> {
  const body = response.body;
  if (!body) {
    throw new SyncProtocolError("Flux de synchronisation sans corps de réponse");
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Découpe un flux d'octets UTF-8 en lignes non vides, en bufferisant la ligne à cheval
 * entre deux chunks. Les espaces en bord de ligne (dont le `\r` d'un éventuel CRLF) sont retirés.
 */
export async function* streamLines(
  chunks: AsyncIterable<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield line;
    }
  }
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail) yield tail;
}

interface ParsedStream {
  generatedAt: string;
  version: string;
  records: number;
  dataLines: number;
  content?: Record<string, string>;
  catalogues: SyncCatalogueDTO[];
  offers: SyncOfferDTO[];
  events: SyncEventDTO[];
}

/** Domaines connus et leur compteur effectif dans un `ParsedStream`. */
function domainCount(domain: string, parsed: ParsedStream): number {
  switch (domain) {
    case "catalogues":
      return parsed.catalogues.length;
    case "offers":
      return parsed.offers.length;
    case "events":
      return parsed.events.length;
    case "content":
      return parsed.content === undefined ? 0 : 1;
    default:
      throw new SyncProtocolError(
        `Domaine inconnu dans "meta.counts" : ${JSON.stringify(domain)}`
      );
  }
}

/**
 * Cœur commun aux deux flux : découpe les lignes, dispatche par `type` (seuls les types de
 * `allowedDataTypes` sont acceptés comme données), puis valide `meta`/`end` et les compteurs.
 */
async function parseStream(
  lines: AsyncIterable<string>,
  allowedDataTypes: ReadonlySet<string>
): Promise<ParsedStream> {
  let meta: MetaLine | undefined;
  let end: EndLine | undefined;
  const parsed: ParsedStream = {
    generatedAt: "",
    version: "",
    records: 0,
    dataLines: 0,
    catalogues: [],
    offers: [],
    events: [],
  };
  let lineNumber = 0;

  for await (const raw of lines) {
    lineNumber++;

    if (end) {
      throw new SyncProtocolError(
        `Ligne inattendue après la ligne "end" (ligne ${lineNumber})`
      );
    }

    let line: Record<string, unknown>;
    try {
      line = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new SyncProtocolError(
        `Ligne NDJSON illisible (ligne ${lineNumber})`
      );
    }

    const type = line.type;

    if (type === "meta") {
      if (meta) throw new SyncProtocolError('Deux lignes "meta" dans le flux');
      if (lineNumber !== 1) {
        throw new SyncProtocolError(
          'La ligne "meta" doit être la première du flux'
        );
      }
      meta = line as unknown as MetaLine;
      continue;
    }

    if (!meta) {
      throw new SyncProtocolError(
        `Ligne de données avant la ligne "meta" (ligne ${lineNumber})`
      );
    }

    if (type === "end") {
      end = line as unknown as EndLine;
      continue;
    }

    if (typeof type !== "string" || !allowedDataTypes.has(type)) {
      throw new SyncProtocolError(
        `Type de ligne inattendu dans ce flux : ${JSON.stringify(type)} (ligne ${lineNumber})`
      );
    }

    // Le champ `type` discriminant ne fait pas partie du DTO : on le retire.
    const { type: _discriminant, ...record } = line;

    switch (type) {
      case "content":
        if (parsed.content !== undefined) {
          throw new SyncProtocolError('Deux lignes "content" dans le flux');
        }
        parsed.content =
          ((record as { entries?: Record<string, string> | null }).entries ??
          {}) as Record<string, string>;
        break;
      case "catalogue":
        parsed.catalogues.push(record as unknown as SyncCatalogueDTO);
        break;
      case "offer":
        parsed.offers.push(record as unknown as SyncOfferDTO);
        break;
      case "event":
        parsed.events.push(record as unknown as SyncEventDTO);
        break;
    }
    parsed.dataLines++;
  }

  if (!meta) {
    throw new SyncProtocolError('Flux de synchronisation vide ou sans ligne "meta"');
  }
  if (!end) {
    throw new SyncProtocolError(
      'Flux de synchronisation tronqué : ligne "end" absente'
    );
  }

  parsed.generatedAt = meta.generatedAt;
  parsed.version = end.version;
  parsed.records = end.records;

  const mismatches: string[] = [];
  for (const [domain, expected] of Object.entries(meta.counts)) {
    const actual = domainCount(domain, parsed);
    if (actual !== expected) {
      mismatches.push(`${domain} attendu ${expected}, reçu ${actual}`);
    }
  }
  if (end.records !== parsed.dataLines) {
    mismatches.push(
      `records attendu ${end.records}, reçu ${parsed.dataLines}`
    );
  }
  if (mismatches.length) {
    throw new SyncProtocolError(
      `Flux de synchronisation incohérent (corps probablement tronqué) : ${mismatches.join(" ; ")}`
    );
  }

  return parsed;
}

const MAIN_DATA_TYPES: ReadonlySet<string> = new Set(["catalogue", "offer"]);
const OTHERS_DATA_TYPES: ReadonlySet<string> = new Set(["content", "event"]);

/** Assemble un `SyncMainSnapshot` à partir des lignes du flux `sync/main`. */
export async function parseSyncMain(
  lines: AsyncIterable<string>
): Promise<SyncMainSnapshot> {
  const parsed = await parseStream(lines, MAIN_DATA_TYPES);
  return {
    version: parsed.version,
    generatedAt: parsed.generatedAt,
    catalogues: parsed.catalogues,
    offers: parsed.offers,
    records: parsed.records,
  };
}

/** Assemble un `SyncOthersSnapshot` à partir des lignes du flux `sync/others`. */
export async function parseSyncOthers(
  lines: AsyncIterable<string>
): Promise<SyncOthersSnapshot> {
  const parsed = await parseStream(lines, OTHERS_DATA_TYPES);
  if (parsed.content === undefined) {
    throw new SyncProtocolError('Flux "sync/others" sans ligne "content"');
  }
  return {
    version: parsed.version,
    generatedAt: parsed.generatedAt,
    content: parsed.content,
    events: parsed.events,
    records: parsed.records,
  };
}

/** Lit et valide entièrement le flux `GET /locale/app/v2/sync/main` d'une `Response`. */
export function parseSyncMainResponse(
  response: Response
): Promise<SyncMainSnapshot> {
  return parseSyncMain(streamLines(readResponseChunks(response)));
}

/** Lit et valide entièrement le flux `GET /locale/app/v2/sync/others` d'une `Response`. */
export function parseSyncOthersResponse(
  response: Response
): Promise<SyncOthersSnapshot> {
  return parseSyncOthers(streamLines(readResponseChunks(response)));
}
