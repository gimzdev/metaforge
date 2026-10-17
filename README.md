<div align="center">

# MetaForge

Teamfight Tactics tier lists, stats explorer and team builder.

[metaforge.lol](https://metaforge.lol) · Next.js · TypeScript · PostgreSQL

<table>
<tr>
<td align="center" width="50%"><img src="docs/screenshots/metaforge-home.png" alt="Home"><br><sub>Home</sub></td>
<td align="center" width="50%"><img src="docs/screenshots/metaforge-meta-report.png" alt="Meta report"><br><sub>Meta report</sub></td>
</tr>
<tr>
<td align="center" width="50%"><img src="docs/screenshots/metaforge-stats-explorer.png" alt="Stats explorer"><br><sub>Stats explorer</sub></td>
<td align="center" width="50%"><img src="docs/screenshots/metaforge-team-builder.png" alt="Team builder"><br><sub>Team builder</sub></td>
</tr>
</table>

<hr>

MetaForge is a Teamfight Tactics site built on real games rather than opinion. Every comp, item and trait
is graded from high-elo ranked matches for the live patch, so the tier lists move when the game does.
You can also dig into the numbers yourself and build a board before you queue.

| | |
|:---|:---|
| **Meta report** | Comps grouped by carry and graded for the live patch; champion, item and trait tier lists |
| **Stats explorer** | Filter boards by champions, items, traits and level, and see how each does |
| **Team builder** | Drag champions onto a board, add items and emblems, save it or share the link |
| **Players** | Ladder and player lookup for every region |
| **Reading** | Guides and patch notes |

Matches are collected through the Riot Games API and kept in PostgreSQL (or a local folder without one);
champions, items and traits come from CommunityDragon, so a new set needs no code change.

<sub>MetaForge isn't endorsed by Riot Games. Riot Games and all associated properties are trademarks of Riot Games, Inc.</sub>

</div>
