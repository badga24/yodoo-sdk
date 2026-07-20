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
const prices = await yodoo.getOfferPrices(offers.content[0].id);
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

Le client contacte toujours `https://yodoo.space/api` — ce n'est pas configurable.

| Option | Requis | Description |
|---|---|---|
| `appId` | oui | Fourni par le propriétaire du commerce |
| `appSecret` | oui | Fourni par le propriétaire du commerce, jamais côté navigateur |

### Méthodes (toutes les routes `/locale/app/**`)

| Méthode | Route | Retour |
|---|---|---|
| `getProvider()` | `GET /locale/app` | `Provider` |
| `listCatalogues(params?)` | `GET /locale/app/catalogues` | `Page<Catalogue>` |
| `getCatalogue(id)` | `GET /locale/app/catalogues/{id}` | `Catalogue` |
| `listCatalogueOffers(catalogueId, params?)` | `GET /locale/app/catalogues/{id}/offers` | `Page<Offer>` |
| `listOffers(params?)` | `GET /locale/app/offers` | `Page<Offer>` |
| `getOfferPrices(offerId)` | `GET /locale/app/offers/{id}/prices` | `Page<Price>` |
| `listPaymentMethods(params?)` | `GET /locale/app/payment-methods` | `Page<PaymentMethod>` |
| `listAvailabilities()` | `GET /locale/app/availabilities` | `Page<Availability>` |
| `listContacts(params?)` | `GET /locale/app/contacts` | `Page<Contact>` |
| `getTopOffers(params?)` | `GET /locale/app/top-offers` | `TopOffers` |
| `getFileUrl(fileId)` | — | URL publique de streaming d'un fichier (`FileRef.id`) |
| `invalidateToken()` | — | Force le renouvellement du token au prochain appel |

`params?` accepte `{ page, size, sort }` (taille max serveur : 30).

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
- Un site tiers appelant l'API directement depuis le navigateur sera bloqué par CORS sauf
  si son origine est whitelistée côté backend — faire les appels depuis le serveur.
- Toutes les routes exposées sont en lecture seule : il n'y a aucun endpoint d'écriture
  (pas de création de commande) pour ce rôle d'app.

## Développement

```bash
npm install
npm run build      # compile src/ -> dist/
npm test           # vitest
npm run typecheck
```
