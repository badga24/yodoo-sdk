import { SyncProtocolError } from "./errors.js";
import type {
  SyncCatalogueDTO,
  SyncCounts,
  SyncEventDTO,
  SyncOfferDTO,
  SyncSnapshot,
} from "./types.js";

/**
 * Parseur du flux NDJSON de `GET /locale/app/v2/sync` (docs/apis/apps/locale.md §7, yodoo_back).
 *
 * Le flux est lu **au fil de l'eau** (jamais `JSON.parse` du corps entier) :
 * `meta` (1re ligne) → `content` (1) → `catalogue`* → `offer`* → `event`* → `end` (dernière ligne).
 * Toute anomalie (ligne `end` absente, compteurs incohérents avec `meta.counts`, ligne illisible,
 * `meta`/`content` en double, donnée après `end`) lève une `SyncProtocolError` : l'appelant garde
 * alors sa version de synchronisation précédente.
 */

interface MetaLine {
  type: "meta";
  generatedAt: string;
  counts: SyncCounts;
}

interface ContentLine {
  type: "content";
  entries: Record<string, string> | null;
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

function assertMetaSeen(
  meta: MetaLine | undefined,
  lineNumber: number
): asserts meta {
  if (!meta) {
    throw new SyncProtocolError(
      `Ligne de données avant la ligne "meta" (ligne ${lineNumber})`
    );
  }
}

/** Assemble un `SyncSnapshot` à partir des lignes JSON déjà découpées du flux. */
export async function parseSync(
  lines: AsyncIterable<string>
): Promise<SyncSnapshot> {
  let meta: MetaLine | undefined;
  let end: EndLine | undefined;
  let content: Record<string, string> | undefined;
  const catalogues: SyncCatalogueDTO[] = [];
  const offers: SyncOfferDTO[] = [];
  const events: SyncEventDTO[] = [];
  let dataLines = 0;
  let lineNumber = 0;

  for await (const raw of lines) {
    lineNumber++;

    if (end) {
      throw new SyncProtocolError(
        `Ligne inattendue après la ligne "end" (ligne ${lineNumber})`
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new SyncProtocolError(
        `Ligne NDJSON illisible (ligne ${lineNumber})`
      );
    }

    // Les lignes de données portent un champ `type` discriminant qui ne fait pas partie
    // du DTO : on le retire avant de conserver l'objet.
    const { type: _discriminant, ...record } = parsed;

    switch (parsed.type) {
      case "meta":
        if (meta) {
          throw new SyncProtocolError('Deux lignes "meta" dans le flux');
        }
        if (lineNumber !== 1) {
          throw new SyncProtocolError(
            'La ligne "meta" doit être la première du flux'
          );
        }
        meta = parsed as unknown as MetaLine;
        break;

      case "content":
        assertMetaSeen(meta, lineNumber);
        if (content !== undefined) {
          throw new SyncProtocolError('Deux lignes "content" dans le flux');
        }
        content = (parsed as unknown as ContentLine).entries ?? {};
        dataLines++;
        break;

      case "catalogue":
        assertMetaSeen(meta, lineNumber);
        catalogues.push(record as unknown as SyncCatalogueDTO);
        dataLines++;
        break;

      case "offer":
        assertMetaSeen(meta, lineNumber);
        offers.push(record as unknown as SyncOfferDTO);
        dataLines++;
        break;

      case "event":
        assertMetaSeen(meta, lineNumber);
        events.push(record as unknown as SyncEventDTO);
        dataLines++;
        break;

      case "end":
        assertMetaSeen(meta, lineNumber);
        end = parsed as unknown as EndLine;
        break;

      default:
        throw new SyncProtocolError(
          `Type de ligne NDJSON inconnu : ${JSON.stringify(parsed.type)} (ligne ${lineNumber})`
        );
    }
  }

  if (!meta) {
    throw new SyncProtocolError('Flux de synchronisation vide ou sans ligne "meta"');
  }
  if (content === undefined) {
    throw new SyncProtocolError('Flux de synchronisation sans ligne "content"');
  }
  if (!end) {
    throw new SyncProtocolError(
      'Flux de synchronisation tronqué : ligne "end" absente'
    );
  }

  const mismatches: string[] = [];
  const expect = (domain: string, expected: number, actual: number) => {
    if (expected !== actual) {
      mismatches.push(`${domain} attendu ${expected}, reçu ${actual}`);
    }
  };
  expect("catalogues", meta.counts.catalogues, catalogues.length);
  expect("offers", meta.counts.offers, offers.length);
  expect("events", meta.counts.events, events.length);
  expect("content", meta.counts.content, 1);
  expect("records", end.records, dataLines);
  if (mismatches.length) {
    throw new SyncProtocolError(
      `Flux de synchronisation incohérent (corps probablement tronqué) : ${mismatches.join(" ; ")}`
    );
  }

  return {
    version: end.version,
    generatedAt: meta.generatedAt,
    content,
    catalogues,
    offers,
    events,
    records: dataLines,
  };
}

/** Lit et valide entièrement le flux NDJSON d'une `Response` de `GET /locale/app/v2/sync`. */
export function parseSyncResponse(response: Response): Promise<SyncSnapshot> {
  return parseSync(streamLines(readResponseChunks(response)));
}
