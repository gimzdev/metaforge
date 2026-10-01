<div align="center">

# MetaForge

### Teamfight Tactics stats, comps and team builder

[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

---

## About

MetaForge is a stats site for Teamfight Tactics **Set 18: Enchanted Wilds**. It collects the final boards of high-elo ranked games from the Riot API and turns them into tier lists, comps, item and trait stats, and a stats explorer you can slice by any combination of champions, items, traits and level.

Everything on the site comes from real games: comps are grouped by their carries, grades account for small samples, and each champion is compared with others of its cost and star level.

---

## Data

<table>
<tr>
<td align="center" width="50%">

### Riot API
Ranked match boards  
15 regions, collected hourly

</td>
<td align="center" width="50%">

### CommunityDragon
Champions, traits, items  
Loaded from the live game data

</td>
</tr>
</table>

---

## Features

<table>
<tr>
<td align="center">

### Meta report
Comp tier list with typical boards  
Champion, item and trait tiers

</td>
<td align="center">

### Stats explorer
Stack conditions on units, items,  
traits, augments and level

</td>
<td align="center">

### Team builder
Drag and drop hex board  
Live synergies, share links

</td>
</tr>
<tr>
<td align="center">

### Patch notes
Buffs, nerfs and changes  
per patch, with a timeline

</td>
<td align="center">

### Ladder and players
Top 100 per region  
Riot ID lookup, match history

</td>
<td align="center">

### Guides
Item recipes with placements  
Emblems and set mechanics

</td>
</tr>
</table>

---

## Stack

```javascript
const tech = {
  frontend: ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4"],
  backend: ["Next.js route handlers", "PostgreSQL (Neon) or local files"],
  data: ["Riot API", "CommunityDragon"],
  deploy: ["Vercel", "hourly cron for collection"]
};
```

---

## Setup

```bash
git clone https://github.com/gimzdev/metaforge.git
cd metaforge
npm install

cp .env.example .env.local
npm run dev
```

Set `RIOT_API_KEY` in `.env.local` to start collecting games, and `DATABASE_URL` for a Postgres database (without it, matches are stored in `.data/`). Riot development keys expire every 24 hours.

To deploy on Vercel, add the same variables plus `CRON_SECRET`; `vercel.json` already schedules the hourly collection.

---

[![Live](https://img.shields.io/badge/Live-000000?style=for-the-badge&logo=rocket&logoColor=white)](https://metaforge.lol)

MetaForge isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

</div>
