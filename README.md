# yodoo-sdk

Client TypeScript typé pour l'API **Yodoo LocaleApp** (`ROLE_LOCALE_APP`) : catalogues,
offres, prix, disponibilités, contacts, moyens de paiement — en lecture seule, via un
couple `appId` / `appSecret`.

Ce package n'est pas publié sur npm. Il s'installe directement depuis son dépôt git.

## Installation

Une fois ce dossier poussé sur votre propre dépôt git :

```bash
npm install git+https://github.com/<votre-compte>/yodoo-sdk.git
# ou, avec SSH :
npm install git+ssh://git@github.com/<votre-compte>/yodoo-sdk.git
```

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
| `getTopOffers(params?)` | `GET /locale/app/top-offers` (v1, pas d'équivalent v2) | `TopOffersDTO` |
| `getContent(ifModifiedSince?)` | `GET /locale/app/v2/content` | `ContentResult` (clé → HTML ; throttlé à 1 payload réel/heure/app, voir plus bas) |
| `registerCustomerFromToken(token)` | `POST /locale/app/v2/customers/from-token` | `CustomerProfileDTO` |
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

**Cache en mémoire** : toutes les méthodes de lecture passant par un `GET` simple
(`getProvider`, `listCatalogues`, `getCatalogue`, `listCatalogueOffers`, `listOffers`,
`getOffer`, `listEvents`, `getEvent`, `getTopOffers`) sont mises en cache côté client, en
mémoire, pour la durée du process — clé = URL complète (query incluse), TTL fixe **1h**, non
configurable. `getContent()` n'est pas concerné (son propre mécanisme `ifModifiedSince` fait
déjà ce rôle). `invalidateCache()` vide tout le cache d'un coup (pas d'invalidation
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
  si son origine est whitelistée côté backend — faire les appels depuis le serveur.
- Presque toutes les routes exposées sont en lecture seule (pas de création de commande pour ce
  rôle d'app) ; `registerCustomerFromToken` est la seule exception depuis le 04/08/2026 — voir
  `docs/apis/apps/locale.md` §5 côté `yodoo_back`.

## Développement

```bash
npm install
npm run build      # compile src/ -> dist/
npm test           # vitest
npm run typecheck
```
