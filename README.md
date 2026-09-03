# yodoo-sdk

Client TypeScript typé pour l'API **Yodoo LocaleApp** (`ROLE_LOCALE_APP`) : catalogues,
offres, prix, disponibilités, contacts, moyens de paiement — en lecture seule, via un
couple `appId` / `appSecret`.

Ce package n'est pas publié sur npm. Il s'installe directement depuis son dépôt git.

## Installation

```bash
npm install git+https://github.com/badga24/yodoo-sdk.git#v0.10.0
# ou, avec SSH :
npm install git+ssh://git@github.com/badga24/yodoo-sdk.git#v0.10.0
```

Le suffixe `#v0.10.0` fige une version précise (voir les tags du dépôt) ; sans lui, `npm install`
suit la branche par défaut.

`npm install` déclenche automatiquement `npm run build` (script `prepare`) : aucune étape
manuelle n'est nécessaire, `dist/` n'a pas besoin d'être commité.

## Utilisation

```ts
import { YodooClient } from "yodoo-sdk";

const yodoo = new YodooClient({
  appId: process.env.YODOO_APP_ID!,
  appSecret: process.env.YODOO_APP_SECRET!,
});

const provider = await yodoo.getProvider();
const catalogues = await yodoo.listCatalogues();
const offers = await yodoo.listOffers({ catalogue: catalogues.content[0].id });
const offer = await yodoo.getOffer(offers.content[0].id); // prices inclus, paginés
```

**Important — `appSecret` ne doit jamais atteindre le navigateur.** Ce client doit être
instancié côté serveur uniquement (route handler, server component, cron...), jamais dans
du code exécuté côté client. Voir aussi la section CORS ci-dessous.

### Dans un projet Next.js (App Router)

Instancier le client une seule fois dans un module serveur, puis l'importer depuis les
Server Components / Route Handlers :

```ts
// lib/yodoo.ts
import "server-only";
import { YodooClient } from "yodoo-sdk";

export const yodoo = new YodooClient({
  appId: process.env.YODOO_APP_ID!,
  appSecret: process.env.YODOO_APP_SECRET!,
});
```

## API

### `new YodooClient(options)`

Le client contacte toujours `https://api.yodoo.space` — ce n'est pas configurable.

| Option | Requis | Description |
|---|---|---|
| `appId` | oui | Fourni par le propriétaire du commerce |
| `appSecret` | oui | Fourni par le propriétaire du commerce, jamais côté navigateur |
| `fileCacheMaxBytes` | non | Taille max (octets) du cache en mémoire de `getFile()`. `0` désactive la mise en cache. Défaut : 50 Mo |
| `autoSync` | non | Lance `sync()` dès la construction, sans bloquer (fire-and-forget). `getStore()` renvoie ensuite le store mémoïsé. Défaut : `false` |

### Méthodes (endpoints `/locale/app/v2/**`, sauf mention contraire)

| Méthode | Route | Retour |
|---|---|---|
| `getProvider()` | `GET /locale/app/v2` | `ProviderDetailDTO` (fusionne provider + moyens de paiement + contacts + disponibilités) |
| `listCatalogues(params?)` | `GET /locale/app/v2/catalogues` | `PageDTO<CatalogueTileDTO>` |
| `getCatalogue(id)` | `GET /locale/app/v2/catalogues/{id}` | `CatalogueDetailDTO` |
| `listCatalogueOffers(catalogueId, params?)` | `GET /locale/app/v2/catalogues/{id}/offers` | `PageDTO<OfferTileDTO>` |
| `listOffers(params?)` | `GET /locale/app/v2/offers` | `PageDTO<OfferTileDTO>` |
| `getOffer(id, params?)` | `GET /locale/app/v2/offers/{id}` | `OfferDetailDTO` (`params` pagine `prices`, pas la liste d'offres) |
| `listEvents(params?)` | `GET /locale/app/v2/events` | `PageDTO<EventTileDTO>` (promotion résolue, ticket en id brut) |
| `getEvent(id)` | `GET /locale/app/v2/events/{id}` | `EventDetailDTO` (promotion et ticket résolus) |
| `sync(previous?)` | `GET /locale/app/v2/sync/main` + `.../sync/others` | `SyncStore` — vue indexée (lookup par id, en mémoire) de tout le commerce, recomposée depuis les deux flux (voir plus bas) |
| `syncMain()` | `GET /locale/app/v2/sync/main` | `SyncMainSnapshot` — catalogues + offres visibles (bas niveau) |
| `syncOthers()` | `GET /locale/app/v2/sync/others` | `SyncOthersSnapshot` — contenu du site + événements (bas niveau) |
| `getStore()` | — | `Promise<SyncStore>` — `sync()` mémoïsé : 1er appel le déclenche, suivants renvoient le même store |
| `refreshStore(scope?)` | — | `Promise<SyncStore>` — re-synchronise les deux flux (ou seulement `"main"` / `"others"`) et remplace le store mémoïsé |
| `getTopOffers(params?)` | `GET /locale/app/top-offers` (v1, pas d'équivalent v2) | `TopOffersDTO` |
| `getContent(ifModifiedSince?)` | `GET /locale/app/v2/content` | `ContentResult` (clé → HTML ; throttlé à 1 payload réel/heure/app, voir plus bas) |
| `registerCustomerFromToken(token)` | `POST /locale/app/v2/customers/from-token` | `CustomerProfileDTO` |
| `createOrder(items, offlineAuthorizationCode?, note?)` | `POST /locale/app/v2/orders` | `OrderDTO` (vente comptoir, articles nés `CLOSED`) |
| `payOrderByMobileMoney(orderId, params)` | `POST /locale/app/v2/orders/{order}/pay/mobile-money` | `InvoiceDTO` |
| `getFileUrl(fileId)` | — | URL publique de streaming d'un fichier (`FileDTO.id`) |
| `getFile(fileId)` | — | `{ bytes, contentType, cacheControl }` — télécharge le fichier, mis en cache en mémoire (voir plus bas) |
| `invalidateToken()` | — | Force le renouvellement du token au prochain appel |
| `invalidateCache()` | — | Vide le cache en mémoire des réponses de lecture (voir plus bas) |

`params?` accepte `{ page, size, sort }` (taille max serveur : 30). `listOffers` accepte
en plus `catalogue` (publicId d'un catalogue, ou un tableau de plusieurs pour un match sur
l'union) et `group` (publicId d'un `OfferGroup`) pour filtrer — indépendants et cumulables.
Un publicId de catalogue inconnu ou n'appartenant pas au commerce fait échouer l'appel en
404. `OfferGroup` n'est plus autrement exposé par cette API (les endpoints de découverte
ont été retirés côté backend) : aucun moyen d'obtenir un id valide via ce client, il faut
le tenir d'ailleurs.

**Changement par rapport à la v1** : `listPaymentMethods()`, `listAvailabilities()`,
`listContacts()` et `getOfferPrices()` n'existent plus — leurs données sont désormais
incluses respectivement dans `getProvider()` (les trois premières) et `getOffer(id)`
(prix, paginés).

**`getContent`** : throttlé à 1 payload réel/heure/app (429 au-delà). Conserver le
`lastModified` reçu et le repasser en `ifModifiedSince` au prochain appel permet de sonder
gratuitement les changements — un 304 renvoie `{ content: null, lastModified }` et ne
consomme pas le quota horaire.

**`sync(previous?)`** : récupère tout ce qu'un rendu SSR à froid doit reconstruire — contenu
du site, catalogues, offres visibles (description HTML complète, prix et fichiers inline),
événements — via **deux flux NDJSON** lus en parallèle, chacun dans une transaction cohérente.
Remplace l'enchaînement `getContent` + `listCatalogues` + `getCatalogue`×N + `listOffers`
(toutes les pages) + `getOffer`×N.

Deux flux **indépendants** (un changement dans l'un n'oblige pas à retélécharger l'autre) :

| Flux | Contenu | Cadence |
|---|---|---|
| `sync/main` | `catalogue` + `offer` (`VISIBLE`, prix/promos/fichiers inline) — le gros, ce qui bouge dans la journée | élevée |
| `sync/others` | `content` (1) + `event` (`promotion` et `ticketOffer` résolus inline) — le « chrome », peu changeant | faible |

`sync()` renvoie un **`SyncStore`** qui recompose les deux : vue indexée où les lookups par id
se résolvent **en mémoire, sans appel réseau**.

```ts
// lib/yodoo.ts — le sync démarre à la construction, sans bloquer l'import
export const yodoo = new YodooClient({
  appId: process.env.YODOO_APP_ID!,
  appSecret: process.env.YODOO_APP_SECRET!,
  autoSync: true,
});

// dans un Server Component / Route Handler
const store = await yodoo.getStore();   // attend les flux déjà en vol, puis les réutilise

store.getOffer(offerId);                 // SyncOfferDTO | undefined  (aucun appel réseau)
store.listOffers({ catalogue: catId });  // SyncOfferDTO[]  (VISIBLE uniquement)
store.getCatalogue(catId);
store.listCatalogues();
store.getEvent(eventId);                 // event.ticketOffer résolu inline (id/nom/statut)
store.resolveTicket(event);              // -> offre complète (prix/fichiers) via sync/main
store.content["hero"];                   // Record<string, string>
store.version;                           // { main, others } — digests opaques par flux
```

Sans `autoSync`, `getStore()` déclenche le `sync()` au premier appel — même mémoïsation
ensuite. Pour rafraîchir : `await yodoo.refreshStore()` (les deux flux), ou
`yodoo.refreshStore("main")` / `"others"` pour n'en re-télécharger qu'un (p. ex. piloté par
le webhook à venir) — l'autre moitié du store est conservée.

- **`getStore()` mémoïse** : un seul `sync()` par process, partagé par les appels concurrents.
  Sur échec, la mémo est vidée → le prochain `getStore()` retente. `autoSync` fait juste ce
  premier `getStore()` depuis le constructeur (fire-and-forget ; une erreur du sync initial
  ressurgit au prochain `getStore()`).
- **Contenu du store** = ce que portent les flux : offres **`VISIBLE` uniquement** (donc pas
  de champ `status`), pas de profil commerce (`getProvider()` reste un appel API), pas de
  top-offres, pas de `posts` d'événement. Un id absent du snapshot renvoie `undefined` —
  jamais de repli silencieux sur l'API.
- **`resolveTicket(event)`** joint `event.ticketOffer.id` contre les offres de `sync/main`
  pour l'offre-billet complète (prix/fichiers). `undefined` si le billet n'est pas `VISIBLE`,
  ou pas encore dans le dernier `sync/main` (billet tout juste créé) — le nom + le statut
  restent lisibles sur `event.ticketOffer`.
- **Snapshot figé** : le store ne se rafraîchit pas seul — passer par `refreshStore()`.
  `store.unchanged` (`{ main, others }`) indique, par flux, si le digest n'a pas bougé depuis
  le `previous` fourni (le flux est quand même téléchargé — pas de conditionnel serveur).
- `store.version` (`{ main, others }`) : **digests opaques**, à repasser tels quels en
  `previous`, ne pas les interpréter ni les recalculer.
- `store.toJSON()` renvoie le snapshot brut (`{ main, others }`) ; `new SyncStore(snapshot)`
  le reconstruit sans appel réseau (persistance sur instance chaude, KV...).
- Chaque flux est lu au fil de l'eau et **validé** : un corps tronqué (Yodoo répond `200`
  puis échoue en cours de flux) ou des compteurs incohérents avec son `meta.counts` lèvent
  une **`SyncProtocolError`** — garder le store précédent dans ce cas.
- `catalogue.offerCount` compte les offres de tous statuts ; seules les `VISIBLE` sont dans le
  store — un écart est normal.
- Budget : **1 build/heure/app par flux** (429 au-delà, indépendant), poll conseillé 1×/heure
  par flux. Pas mis en cache côté client (voir plus bas).

**Cache en mémoire** : toutes les méthodes de lecture passant par un `GET` simple
(`getProvider`, `listCatalogues`, `getCatalogue`, `listCatalogueOffers`, `listOffers`,
`getOffer`, `listEvents`, `getEvent`, `getTopOffers`) sont mises en cache côté client, en
mémoire, pour la durée du process — clé = URL complète (query incluse), TTL fixe **1h**, non
configurable. `getContent()` et `sync()` n'y sont pas soumis (`getContent` a son propre
mécanisme `ifModifiedSince` ; `sync()` renvoie un `SyncStore` figé qu'on rafraîchit
explicitement, borné par le budget serveur d'1 appel/heure par flux). `invalidateCache()` vide tout le cache d'un coup (pas d'invalidation
granulaire par clé) ; à appeler quand on sait qu'une donnée a changé côté commerce et qu'on
ne veut pas attendre l'expiration du TTL.

**`getFile(fileId)`** a son propre cache en mémoire, séparé, borné en **octets** (pas en
TTL) via `fileCacheMaxBytes` (défaut 50 Mo) : les entrées les plus anciennes sont évincées
(LRU) pour faire de la place, et une entrée qui dépasse le budget à elle seule est
simplement ignorée (jamais d'erreur) — `fileCacheMaxBytes: 0` désactive donc la mise en
cache. Pas de TTL nécessaire, `fileId` étant un identifiant immuable côté backend. Le champ
`cacheControl` renvoyé est la valeur telle quelle envoyée par Yodoo (`immutable`, 365 jours)
— à retransmettre sur la réponse HTTP finale si ce fichier est reproxifié vers un
navigateur ; le cache en mémoire de `getFile()` ne fait pas ce travail à ta place, il évite
seulement de rappeler Yodoo depuis ce process.

### Gestion des erreurs

Les erreurs HTTP sont converties en instances typées de `DomainError` :
`UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`ValidationError` (400), `RateLimitedError` (429), `ServerError` (autres).
`sync()` peut en plus lever `SyncProtocolError` (aussi une `DomainError`) quand le flux
NDJSON reçu est tronqué ou incohérent.

```ts
import { NotFoundError } from "yodoo-sdk";

try {
  await yodoo.getCatalogue("inconnu");
} catch (err) {
  if (err instanceof NotFoundError) {
    // ...
  }
  throw err;
}
```

### Utilitaires

- `formatMoney(amountMinorUnits, currency, locale?)` — formate un prix (entier en plus
  petite unité de devise, ex. centimes) en chaîne lisible via `Intl.NumberFormat`.
- `buildFileUrl(apiBaseUrl, fileId)` — équivalent autonome de `client.getFileUrl(fileId)`, pour
  construire l'URL d'un fichier à partir d'une base d'API arbitraire.

## Notes

- Le token d'app (JWT) est mis en cache en mémoire pour la durée de vie du process et
  renouvelé automatiquement sur expiration ou 401 — l'endpoint d'auth est limité à
  10 req/min par IP, ne jamais l'appeler à chaque requête.
- Les réponses des méthodes de lecture sont elles aussi mises en cache en mémoire (TTL fixe
  1h, voir `invalidateCache()`) — deux appels identiques à `listOffers()` dans l'heure ne font
  qu'une requête HTTP.
- Un site tiers appelant l'API directement depuis le navigateur sera bloqué par CORS sauf
  si son origine est whitelistée côté Yodoo — faire les appels depuis le serveur.
- La plupart des routes exposées sont en lecture seule. Les exceptions : `registerCustomerFromToken`,
  `createOrder` et `payOrderByMobileMoney`.
- `createOrder` et `payOrderByMobileMoney` agissent au nom d'un client précis, identifié par un
  `offlineAuthorizationCode` (code hors-ligne signé, généré côté app cliente — hors-scope de ce
  SDK). Sur `payOrderByMobileMoney`, ce code est obligatoire : toute requête qui l'omet est
  rejetée (403) avant même d'initier le paiement. Sur `createOrder`, il est optionnel — l'omettre
  attribue la commande au profil auto-référentiel du commerce plutôt qu'à un client identifié
  (utile pour une intégration sans notion de client connecté, ex. commande anonyme depuis un site
  vitrine) ; passer `note` pour transmettre des coordonnées collectées côté formulaire dans ce cas.

## Développement

```bash
npm install
npm run build      # compile src/ -> dist/
npm test           # vitest
npm run typecheck
```

## Historique des versions

- **04/08/2026** — ajout de `registerCustomerFromToken`.
- **30/08/2026** — `idempotencyKey` devient obligatoire sur `payOrderByMobileMoney` (avant cette
  date, un retry réseau côté app pouvait déclencher un second transfert pour un même achat).
- **31/08/2026** — ajout de `createOrder`/`payOrderByMobileMoney`, avec `offlineAuthorizationCode`
  obligatoire sur les deux.
- **01/09/2026** — `offlineAuthorizationCode` devient optionnel sur `createOrder` (toujours
  obligatoire sur `payOrderByMobileMoney`).
- **03/09/2026** — ajout de `sync()` : flux NDJSON *full-replace* de tout le commerce
  (contenu + catalogues + offres visibles + événements) en une lecture cohérente, pour un
  rendu SSR à froid sans enchaîner les appels unitaires. Renvoie un `SyncStore` (lookup par
  id résolu en mémoire) ; `SyncResult` de la v0.7.0 est retiré.
- **03/09/2026** — option `autoSync` (lance `sync()` à la construction, non bloquant) +
  `getStore()` (`sync()` mémoïsé) / `refreshStore()` (re-sync forcée).
- **03/09/2026** — la synchro est **scindée en deux flux** `sync/main` (catalogues + offres) et
  `sync/others` (contenu + événements), chacun avec son `version` et son budget horaire.
  `sync()` lit les deux ; `syncMain()` / `syncOthers()` exposent chaque flux, `refreshStore("main"
  | "others")` en rafraîchit un seul. `store.version` / `store.unchanged` deviennent
  `{ main, others }`. Sur la ligne `event`, `ticketOfferId` est remplacé par `ticketOffer`
  (billet résolu inline : `{ id, name, description, status }`).
