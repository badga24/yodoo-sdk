---
name: yodoo-existing-site-integration
description: >-
  Accompagner le prompteur qui veut brancher `yodoo-sdk` sur un site déjà
  existant (pas un projet reparti de zéro). Détecte le framework et
  l'affichage des offres depuis le code avant de poser des questions, oriente
  vers les bonnes pages de `business.yodoo.space` pour gérer clés de contenu,
  offres et infos du commerce, choisit entre appel dynamique aux offres et
  clé de contenu au cas par cas avec une recommandation explicite, tient un
  journal des clés utilisées avec leurs valeurs par défaut, s'assure que
  l'intégration reste strictement côté serveur (SSR) pour ne jamais exposer
  `appSecret`, et propose une rétrospective en fin de session. À charger dès
  qu'il est question d'ajouter Yodoo à un site qui existe déjà, avant
  d'écrire du code.
---

# Intégrer yodoo-sdk dans un site existant

Public : le **prompteur** — pas forcément le commerçant lui-même, peut être un développeur
qui agit pour son compte — qui a **déjà un site en production** et veut y brancher le
catalogue, les offres, les infos de contact ou du contenu éditorial Yodoo. Le site, son
framework, ses conventions de code et son contenu existent déjà et ne sont pas négociables
sans raison. Ce skill dit **comment s'insérer dans l'existant sans le casser, et comment
faire participer le prompteur aux décisions qui le concernent**.

Principe transversal : à chaque point de décision ci-dessous, donner une **recommandation
explicite** — jamais se contenter de lister des options sans avis. Le prompteur reste libre
de trancher autrement, mais ne doit jamais repartir sans savoir ce que l'agent aurait fait
à sa place.

## Checklist

1. **Cadrer avant de coder, mais deviner avant de demander** : détecter framework et mode
   d'affichage des offres depuis le code ; ne poser au prompteur que ce qui ne se déduit
   pas du code (besoin fonctionnel, préférence sur les clés de contenu) (§1).
2. **Vérifier que l'intégration peut être 100 % serveur** avant d'écrire une ligne : pas
   de rendu serveur réel → bloquant, à résoudre avec le prompteur avant toute autre chose ;
   conseiller sur l'hébergement si utile, sans jamais l'imposer (§6).
3. **Offres/catalogues : lire le code, déterminer affichage groupé ou individuel, exposer
   les deux options avec une recommandation, demander la préférence du prompteur.** Ne
   jamais trancher silencieusement (§3).
4. **Contenu textuel : proposer, ne pas imposer.** Expliquer le bénéfice concret de chaque
   clé candidate, laisser le prompteur décider bloc par bloc, toujours avec une
   recommandation (§4).
5. **Indiquer précisément où agir** sur `business.yodoo.space` une fois une décision prise
   (§2).
6. **Tenir à jour le journal des clés** dans un fichier consultable par le prompteur, à
   chaque session qui en crée ou en modifie (§5).
7. **Proposer une rétrospective en fin de session** et, si le retour est positif et
   GitHub accessible, le remonter en issue sur le dépôt `yodoo-sdk` (§7).

## 1. Cadrage avant de coder

Essayer de répondre soi-même avant de demander — ne poser au prompteur que ce que le code
ne peut pas trancher.

| Question | Comment y répondre en premier | Ce qu'elle détermine |
|---|---|---|
| Quel framework fait tourner le site ? | Lire `package.json` (dépendances `next`, `nuxt`, `svelte`/`@sveltejs/kit`, `astro`, `@remix-run/*`...), les fichiers de config (`next.config.*`, `nuxt.config.*`...) et la structure de dossiers. Ne demander au prompteur qu'en dernier recours, si la détection reste ambiguë (monorepo, config non standard, plusieurs candidats) | Si un rendu serveur existe déjà et où l'intégrer (§6) |
| Les offres sont-elles affichées en groupe (un seul gabarit de liste/grille) ou individuellement (une vue dédiée par offre) ? | Lire le code (composants de carte produit, gabarits de liste vs pages dédiées par produit) — jamais demandé frontalement | Signal de départ de §3 |
| Le prompteur a-t-il déjà une app Yodoo (`appId`/`appSecret`) ? | Vérifier avec lui via `/developer` (§2) plutôt que supposer | Si la création d'une app est un préalable |
| Que veut-il connecter en premier : catalogues/offres, infos de contact, contenu éditorial, prise de commande ? | Se demande, ne se déduit pas du code — poser la question directement | Le périmètre de la première itération, pour ne pas tout brancher d'un coup sur un site qui tournait très bien sans |

Ne pas demander où le site est hébergé : cette information ne change aucune décision de ce
skill (voir §6 — l'alternative en cas d'absence de rendu serveur ne dépend pas de
l'hébergeur précis). Un conseil d'hébergement reste possible s'il s'avère utile en cours de
route, mais toujours comme suggestion, jamais comme condition à remplir.

## 2. Où agir — `business.yodoo.space`

Une fois une décision prise, donner l'adresse précise plutôt qu'une formulation vague :

| Besoin | Adresse |
|---|---|
| Vue d'ensemble du tableau de bord | `https://business.yodoo.space/dashboard` |
| Liste des apps créées, création d'une app (`appId`/`appSecret`) | `https://business.yodoo.space/developer` |
| Clés de contenu d'une app précise (créer/éditer, lier à un fichier/une offre/un prix/un catalogue) | `https://business.yodoo.space/developer/apps/{app-id}` |
| Catalogues et offres | `https://business.yodoo.space/offers` |
| Fichiers (images...) | `https://business.yodoo.space/storage` |
| Infos du commerce (contacts, nom, position si commerce physique) | `https://business.yodoo.space/business` |

Une modification de clé de contenu reste soumise au budget de lecture côté API (une lecture
réelle par heure et par app) : elle est enregistrée immédiatement côté Yodoo, mais peut
mettre jusqu'à une heure à réapparaître côté site selon la fréquence à laquelle celui-ci
relit le contenu.

## 3. Offres et catalogues : dynamique vs clé de contenu

C'est la décision la plus structurante de ce skill, et celle qui mérite le plus de
prudence — elle se décide au cas par cas, jamais par défaut.

**Méthode** :

1. Lire les vues existantes qui affichent des offres/produits. Déterminer si l'affichage
   est **groupé** (un seul gabarit générique pour toutes les offres) ou **individuel** (une
   vue/mise en forme dédiée par offre) — sans poser la question frontalement au prompteur,
   c'est une lecture de code. Un affichage individuel est un signal, pas une certitude,
   qu'une clé de contenu sera utile : la variation par offre y est souvent un choix
   éditorial qui ne se déduit pas des données.
2. Pour chaque variation visuelle repérée (badge, couleur, visuel dédié, ordre de mise en
   avant, texte additionnel), se demander si elle est **déductible d'un champ déjà
   disponible** via l'API (catalogue, prix/promo, statut, nom, tag) — une règle
   généralisable, pas un cas particulier.
3. Dès que ce signal apparaît (affichage individuel, ou variation non déductible dans un
   affichage groupé), ne pas trancher seul : exposer les deux options en quelques phrases
   au prompteur, puis lui demander explicitement laquelle lui conviendrait le mieux, avec
   une recommandation.

   > **Deux façons d'afficher une offre** :
   > 1. **Dynamique** — le site lit directement le catalogue/les offres via l'API à chaque
   >    génération de page (`listOffers`/`sync()`). Zéro maintenance manuelle, toute
   >    nouvelle offre apparaît sans action ; en contrepartie, la mise en forme suit une
   >    règle unique appliquée à toutes les offres — pas de mise en avant ponctuelle sans
   >    une règle qui la justifie dans les données elles-mêmes.
   > 2. **Clé de contenu** — une clé dédiée, éventuellement liée à une offre précise
   >    (`getContentEntries`, champ `offerId`/`fileId`), que le prompteur remplit depuis
   >    `/developer/apps/{app-id}` (§2). Contrôle éditorial fin, changeable sans
   >    redéploiement ; en contrepartie, une action de plus à faire à chaque changement, et
   >    rien n'apparaît tant que la clé n'est pas remplie.

4. Les deux se combinent souvent sur un même site : grille d'offres générée dynamiquement
   **et** une ou deux clés dédiées à une mise en avant (`featured_offer`, bandeau promo).

Le "probablement" de l'étape 1 est une hypothèse de travail née de la lecture du code, pas
une conclusion à imposer — le prompteur peut avoir une raison (visuelle, commerciale) de
préférer l'autre option même quand l'automatisation est techniquement possible. La
recommandation de l'agent doit être explicite (dynamique ou clé, et pourquoi), pas une
liste neutre laissée à son interprétation.

## 4. Contenu textuel : proposer, ne pas imposer

Le prompteur ne veut pas forcément gérer tous les textes via des clés de contenu — il a
peut-être déjà un CMS, un flux git, ou préfère simplement ne pas avoir un écran de plus à
maintenir. Pour chaque bloc de texte candidat :

- Expliquer concrètement le bénéfice **pour ce bloc précis** : "ce texte pourra être changé
  depuis `/developer/apps/{app-id}`, sans redéploiement" — pas un argumentaire générique
  sur les clés de contenu.
- Signaler aussi le coût : une clé de plus à retenir/retrouver, une valeur par défaut à
  garder cohérente dans le code si elle n'est jamais remplie.
- Donner une recommandation, pas seulement les deux options : le contenu qui change souvent
  (bandeau promo, annonce, accroche saisonnière) est en général un bon candidat ; le
  contenu stable (mentions légales, structure de page) l'est rarement — le dire clairement,
  à confirmer avec le prompteur plutôt qu'à trancher seul.
- Décider **bloc par bloc**, jamais en bloc entier ("toutes les clés" ou "aucune clé") — le
  prompteur peut très bien vouloir une clé pour le bandeau d'accueil et rien d'autre.

## 5. Journal des clés de contenu

Toute session qui crée ou modifie une clé de contenu tient à jour un journal, dans un
fichier **markdown lisible par le prompteur**, versionné avec le reste du site. Avant d'en
créer un, vérifier qu'il n'existe pas déjà (une session précédente a pu le poser ailleurs
que l'emplacement par défaut) — le mettre à jour plutôt que d'en dupliquer un second.

**Emplacement par défaut** (à la racine du site, faute d'un endroit plus évident où le
prompteur range déjà de la documentation) : `YODOO-CONTENU.md`.

**Format** — une ligne par clé :

```markdown
| Clé | Utilisée dans | Rôle | Lien attendu | Valeur par défaut dans le code |
|---|---|---|---|---|
| `hero_intro` | `components/Hero.tsx` | Titre d'accroche de la page d'accueil | — | "Bienvenue" |
| `featured_offer` | `components/OfferHighlight.tsx` | Offre mise en avant en page d'accueil | offre (`offerId`) | aucune (section masquée si absente) |
```

- **Valeur par défaut** = ce que le site affiche si la clé n'est pas encore remplie sur
  `/developer/apps/{app-id}` — toujours vraie, jamais aspirationnelle : si le composant
  masque la section en l'absence de clé, l'écrire tel quel plutôt que de laisser une case
  vide.
- Une clé retirée du code est retirée du journal dans la même session, pas laissée en trace
  morte.
- Ce fichier est la seule source que le prompteur doit consulter pour savoir quoi remplir
  et où — ne pas s'attendre à ce qu'il aille lire le code.

## 6. SSR obligatoire — `appSecret` ne doit jamais atteindre le navigateur

`yodoo-sdk` s'authentifie avec `appSecret` : exposé côté client, n'importe qui peut
consommer le quota de l'app à sa place, lire des données qui ne devraient transiter que
serveur à serveur, voire écrire (`createOrder`) en usurpant l'intégration. Ce n'est pas
négociable techniquement — mais la manière de le poser au prompteur l'est.

**Avant tout code** : confirmer que le site a un vrai rendu serveur pour la page qui
utilisera le SDK (route/component serveur du framework détecté en §1, fonction serverless,
route API) — pas seulement un framework qui *peut* faire du SSR si le site en question ne
l'utilise pas sur ces pages. Un site purement statique/SPA (HTML+JS livré tel quel, sans
backend) n'a **aucun** endroit où `appSecret` peut vivre en sécurité.

**Face à un site sans backend** : rester factuel et calme, ne pas juste refuser. Expliquer
le risque concret (pas un principe abstrait) — "cette clé permettrait à n'importe quel
visiteur qui ouvre les outils de dev de faire des appels en votre nom, sans limite de votre
côté" — puis proposer une alternative adaptée à ce qui existe déjà : une seule fonction
serverless/edge qui fait office de proxy (même minimale : un seul endpoint qui relaie
`getContent`/`listOffers`), plutôt qu'une refonte du site. Un conseil sur où héberger cette
fonction peut être donné à ce stade si le prompteur le demande, mais reste une suggestion
parmi d'autres — jamais une obligation, et jamais motif à demander où le site est hébergé
en amont (§1). Le but est d'obtenir un endroit serveur, pas de forcer une migration de
stack.

**Si le prompteur insiste pour une intégration côté client malgré l'alternative
proposée** : redemander une confirmation explicite une fois le risque nommé clairement,
puis s'exécuter — c'est sa décision, à condition qu'elle soit informée. Noter ce choix (et
le fait qu'il a été signalé) dans le même fichier que le journal de §5 ou en commentaire à
l'endroit du code concerné, pour qu'une session future ne le redécouvre pas sans contexte.

## 7. Rétrospective de fin de session

En fin de session, proposer au prompteur une rétrospective : ce qui n'a pas fonctionné,
ce qui pourrait être amélioré côté skill ou côté SDK. Une proposition, pas une insistance —
passer à autre chose si le prompteur décline ou ne répond pas sur ce point.

S'il accepte et donne un retour de fond (pas un simple "non merci"), et si un accès GitHub
est disponible dans la session : ouvrir une issue sur le dépôt `yodoo-sdk`
(`badga24/yodoo-sdk`) résumant ce retour, pour qu'il serve à faire évoluer le SDK ou ce
skill. Ne pas ouvrir d'issue sur un retour vague ou non confirmé, et ne jamais la présenter
comme automatique — le prompteur doit savoir qu'elle part avant qu'elle parte.

## Anti-patterns

| Anti-pattern | Conséquence | Correctif |
|---|---|---|
| Demander le framework ou l'hébergement avant d'avoir lu `package.json`/la config | question inutile, donne l'impression de ne pas avoir regardé le code | détection avant question, hébergement jamais demandé (§1) |
| Décider seul "dynamique" ou "clé de contenu" sans lire le code ni consulter le prompteur | mauvais choix structurant, à défaire plus tard | méthode de §3 : lire, exposer les deux options, recommander, demander |
| Lister les options sans donner d'avis | le prompteur doit trancher seul un sujet technique qu'il n'a pas à arbitrer sans recommandation | toujours une recommandation explicite (principe transversal, §3, §4) |
| Proposer des clés de contenu pour tous les textes d'un coup | prompteur qui se sent envahi, adoption rejetée en bloc | décision bloc par bloc, bénéfice concret par bloc (§4) |
| Créer un client Yodoo dans un composant qui tourne côté navigateur | fuite d'`appSecret` | vérifier le rendu serveur réel avant tout code (§6) |
| Rester vague sur où éditer une clé ou une info du commerce | le prompteur ne sait pas quoi remplir ni où | donner l'adresse précise sur `business.yodoo.space` (§2) |
| Créer/modifier des clés sans mettre à jour le journal | valeurs par défaut et clés existantes oubliées, doublons au fil des sessions | journal à jour à chaque session concernée, fichier unique (§5) |
| Refuser tout net une intégration côté client sans proposer d'alternative | prompteur bloqué, ou qui code la fuite lui-même sans supervision | toujours une alternative serveur concrète avant d'accepter, si acceptée (§6) |
| Ouvrir une issue GitHub sur un retour de rétrospective vague ou non sollicité | bruit sur le dépôt, retour qui ne reflète pas vraiment l'avis du prompteur | proposer, attendre un retour de fond confirmé, prévenir avant d'ouvrir l'issue (§7) |
