/** Minimal DTOs for the TFT endpoints MetaForge uses. */

export interface AccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export interface AccountRegionDto {
  puuid: string;
  game: string;
  region: string;
}

export interface SummonerDto {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
  revisionDate: number;
}

export interface LeagueItemDto {
  puuid: string;
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

export interface LeagueListDto {
  tier: string;
  leagueId?: string;
  queue?: string;
  name?: string;
  entries: LeagueItemDto[];
}

export interface LeagueEntryDto {
  puuid?: string;
  queueType: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
  inactive?: boolean;
  ratedTier?: string;
  ratedRating?: number;
}

export interface MatchUnitDto {
  character_id: string;
  itemNames?: string[];
  name?: string;
  rarity?: number;
  tier?: number;
}

export interface MatchTraitDto {
  name: string;
  num_units: number;
  style?: number;
  tier_current: number;
  tier_total?: number;
}

export interface MatchParticipantDto {
  puuid: string;
  placement: number;
  level: number;
  gold_left?: number;
  last_round?: number;
  players_eliminated?: number;
  time_eliminated?: number;
  total_damage_to_players?: number;
  traits?: MatchTraitDto[];
  units?: MatchUnitDto[];
  augments?: string[] | null;
  riotIdGameName?: string;
  riotIdTagline?: string;
  win?: boolean;
  partner_group_id?: number;
  companion?: { content_ID?: string; species?: string; skin_ID?: number };
}

export interface MatchDto {
  metadata: { match_id: string; participants: string[]; data_version?: string };
  info: {
    game_datetime: number;
    game_length: number;
    game_version: string;
    queue_id?: number;
    queueId?: number;
    tft_game_type?: string;
    tft_set_core_name?: string;
    tft_set_number: number;
    participants: MatchParticipantDto[];
  };
}
