# Myths and legends · public release 17 November 2026

The public museum now has fifteen curated myths and traditions: twelve new sourced stories and three retained Buran stories. The technical landing-turn account remains available in the archive and through existing links, outside this selection. The encyclopedia contains 124 articles.

New cards distinguish documented events, traditions, disputed popular accounts, literary fiction and unverified folklore. Plesetsk stories have no false Baikonur site pin. Story navigation clears the preceding object's organization and launch controls. Full article data still loads through the existing deferred queue; no new 3D assets, textures or render work were introduced.

## Deployment and source history

The production origin is https://museum.rockettrip.space. The guarded server release is `32f701f805a182c639d50a78fc777d1abb3586b4-myths-legends-20261117`, based on `32f701f805a182c639d50a78fc777d1abb3586b4-accident-category-20261117`.

GitHub main at `d223153178dc39f90a7228d0ab542066c7001c7f` predates intervening server releases. This directory records the exact tested source delta against the live baseline; it does not overwrite main's runtime with an unreviewed synchronization of those intervening changes. The ten runtime files were deployed to the server and synchronized to the existing local source snapshot. The protected repository update archives this release.

`source.patch.gz` is a UTF-8 unified patch compressed with gzip. It contains the ten runtime changes and the related menu contract update. Apply only to a copy of the named production baseline after checking all `before` hashes in `manifest.json`; do not apply blindly to main. Applying the patch to the retained baseline reproduced every candidate `after` hash exactly. The menu test correction also accounts for the seven existing fall-field actions, fixing its obsolete two-action expectation.

`new-stories.json` provides readable source records and citations. `checks.json` records candidate and public browser results, structural validation and public hashes. The browser scenarios open every story, check evidence badges, citations and share targets, open a direct story link, and filter the encyclopedia. Public verification uses live responses without candidate interception. Mobile results use Playwright WebKit iPhone 15 Pro emulation; no physical iPhone performance claim is made.

Scene, fog, models, transport, launch dock and startup files were preserved and verified by hashes. Publication used a guarded release-directory copy, nginx validation and reload; no protection or CI policy was changed.
