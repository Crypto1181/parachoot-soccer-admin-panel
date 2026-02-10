
// FlashScore API Types and Service for Admin Panel

// --- Types ---

export interface Team {
  id: string;
  name: string;
  logo: string;
  shortName?: string;
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  status: 'live' | 'upcoming' | 'finished';
  minute?: number;
  competition: string;
  startTime?: string; // HH:MM
  streamUrl?: string;
  venue?: string;
  referee?: string;
  country?: string;
  score1stHalf?: { home: number; away: number };
  score2ndHalf?: { home: number; away: number };
}

export interface League {
  id: string;
  name: string;
  country: string;
  logo: string;
  url: string;
}

export interface LeagueGroup {
  league: League;
  matches: Match[];
}

interface FlashScoreTeam {
  team_id: string;
  name: string;
  short_name: string;
  smaill_image_path?: string;
  small_image_path?: string;
  image_path?: string;
  red_cards: number;
}

interface FlashScoreMatch {
  match_id: string;
  timestamp: number;
  match_status: {
    stage: string | null;
    is_cancelled: boolean;
    is_postponed: boolean;
    is_started: boolean;
    is_in_progress: boolean;
    is_finished: boolean;
    live_time: string | null;
  };
  home_team: FlashScoreTeam;
  away_team: FlashScoreTeam;
  scores: {
    home: number | null;
    away: number | null;
    home_1st_half?: number | null;
    away_1st_half?: number | null;
    home_2nd_half?: number | null;
    away_2nd_half?: number | null;
  };
  odds?: {
    "1": number;
    "2": number;
    "X": number;
  };
}

interface FlashScoreTournament {
  name: string;
  country_name: string;
  tournament_url: string;
  image_path: string;
  matches?: FlashScoreMatch[];
}

// --- API Configuration ---

const FLASHSCORE_API_BASE = 'https://flashscore4.p.rapidapi.com';
const FLASHSCORE_API_KEY = 'bffdb88075msh1832f65b5a81519p1ea775jsn5ca875a7973e';

// Request cache to avoid redundant API calls
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5000;

const getCachedOrFetch = async (cacheKey: string, fetchFn: () => Promise<any>, cacheTime: number = CACHE_DURATION): Promise<any> => {
  const cached = requestCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < cacheTime) {
    return cached.data;
  }
  
  const data = await fetchFn();
  requestCache.set(cacheKey, { data, timestamp: now });
  
  // Clean old cache entries (older than 1 minute)
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > 60000) {
      requestCache.delete(key);
    }
  }
  
  return data;
};

// --- Transformers ---

const transformTeam = (fsTeam: any, teamId: string): Team => {
  if (!fsTeam) {
    return {
      id: teamId || 'unknown',
      name: 'Unknown Team',
      shortName: 'UNK',
      logo: '',
    };
  }

  const logo = fsTeam.smaill_image_path || fsTeam.small_image_path || fsTeam.image_path || '';
  
  return {
    id: teamId,
    name: fsTeam.name || 'Unknown',
    shortName: fsTeam.short_name || fsTeam.name?.substring(0, 3).toUpperCase() || 'UNK',
    logo: logo,
  };
};

const transformMatch = (
  fsMatch: FlashScoreMatch, 
  competition: string, 
  status: 'live' | 'upcoming' | 'finished' = 'live',
  minute?: number
): Match => {
  if (!fsMatch) {
    throw new Error('Match data is missing');
  }

  const homeId = fsMatch.home_team?.team_id || `home-${fsMatch.match_id}`;
  const awayId = fsMatch.away_team?.team_id || `away-${fsMatch.match_id}`;

  const homeTeam = transformTeam(fsMatch.home_team, homeId);
  const awayTeam = transformTeam(fsMatch.away_team, awayId);
  
  let derivedStatus = status;
  let derivedMinute = minute;

  if (fsMatch.match_status) {
      if (fsMatch.match_status.is_finished) {
          derivedStatus = 'finished';
      } else if (fsMatch.match_status.is_in_progress) {
          derivedStatus = 'live';
          if (fsMatch.match_status.live_time) {
              if (fsMatch.match_status.live_time === 'Half Time') {
                  derivedMinute = 45;
              } else {
                  const parsed = parseInt(fsMatch.match_status.live_time);
                  if (!isNaN(parsed)) {
                      derivedMinute = parsed;
                  }
              }
          }
      } else if (fsMatch.match_status.is_cancelled || fsMatch.match_status.is_postponed) {
          derivedStatus = 'finished';
      } else if (!fsMatch.match_status.is_started) {
          derivedStatus = 'upcoming';
      }
  }

  let startTime: string | undefined = undefined;
  if (fsMatch.timestamp) {
    const date = new Date(fsMatch.timestamp * 1000);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    startTime = `${hours}:${minutes}`;
  }
  
  return {
    id: fsMatch.match_id,
    homeTeam,
    awayTeam,
    homeScore: fsMatch.scores.home !== null && fsMatch.scores.home !== undefined ? fsMatch.scores.home : null,
    awayScore: fsMatch.scores.away !== null && fsMatch.scores.away !== undefined ? fsMatch.scores.away : null,
    status: derivedStatus,
    minute: derivedMinute,
    competition,
    startTime,
    streamUrl: undefined,
  };
};

// --- API Service ---

export const flashscoreApi = {
  async getLiveMatchesGrouped(): Promise<LeagueGroup[]> {
    const cacheKey = 'live-matches-grouped';
    return getCachedOrFetch(cacheKey, async () => {
      try {
        const response = await fetch(`${FLASHSCORE_API_BASE}/api/flashscore/v2/matches/live?sport_id=1`, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
            'x-rapidapi-key': FLASHSCORE_API_KEY,
          },
        });

        if (!response.ok) return [];

        const data: FlashScoreTournament[] = await response.json();
        if (!Array.isArray(data)) return [];

        const leagueGroupsMap = new Map<string, LeagueGroup>();
      
        for (const tournament of data) {
          if (!tournament.matches || !Array.isArray(tournament.matches) || tournament.matches.length === 0) continue;

          const matches: Match[] = tournament.matches
            .map(fsMatch => transformMatch(fsMatch, tournament.name, 'live'))
            .filter(match => match.status === 'live');

          if (matches.length === 0) continue;

          const leagueId = tournament.tournament_url || tournament.name.toLowerCase().replace(/\s+/g, '-');
          
          if (leagueGroupsMap.has(leagueId)) {
            const existingGroup = leagueGroupsMap.get(leagueId)!;
            existingGroup.matches.push(...matches);
          } else {
            const league: League = {
              id: leagueId,
              name: tournament.name,
              country: tournament.country_name,
              logo: tournament.image_path,
              url: tournament.tournament_url,
            };
            leagueGroupsMap.set(leagueId, { league, matches });
          }
        }

        return Array.from(leagueGroupsMap.values());
      } catch (error) {
        console.error('[FlashScore] Error fetching live matches:', error);
        return [];
      }
    }, 3000);
  },

  async getMatchesForDate(date: string, filterStatus?: 'live' | 'upcoming' | 'finished'): Promise<LeagueGroup[]> {
    let apiDate = date;
    if (date === '0' || date === 'today') {
      const today = new Date();
      apiDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    
    const cacheKey = `matches-date-${apiDate}-${filterStatus || 'all'}`;
    const cacheTime = filterStatus === 'live' ? 3000 : 30000;
    
    return getCachedOrFetch(cacheKey, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [year, month, day] = apiDate.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);
      
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      let url = `${FLASHSCORE_API_BASE}/api/flashscore/v2/matches/list-by-date?date=${apiDate}&sport_id=1`;
      if (diffDays >= -7 && diffDays <= 7) {
        url = `${FLASHSCORE_API_BASE}/api/flashscore/v2/matches/list?day=${diffDays}&sport_id=1`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
          'x-rapidapi-key': FLASHSCORE_API_KEY,
        },
      });

      if (!response.ok) throw new Error(`FlashScore API error: ${response.status}`);

      const data: FlashScoreTournament[] = await response.json();
      
      const leagueGroupsMap = new Map<string, LeagueGroup>();
      
      for (const tournament of data) {
        if (!tournament.matches || !Array.isArray(tournament.matches) || tournament.matches.length === 0) continue;

        const matches: Match[] = tournament.matches
          .map(fsMatch => transformMatch(fsMatch, tournament.name, 'upcoming'))
          .filter(match => !filterStatus || match.status === filterStatus);

        if (matches.length > 0) {
          const leagueId = tournament.tournament_url || tournament.name.toLowerCase().replace(/\s+/g, '-');
          if (leagueGroupsMap.has(leagueId)) {
            const existingGroup = leagueGroupsMap.get(leagueId)!;
            existingGroup.matches.push(...matches);
          } else {
            const league: League = {
              id: leagueId,
              name: tournament.name,
              country: tournament.country_name,
              logo: tournament.image_path,
              url: tournament.tournament_url,
            };
            leagueGroupsMap.set(leagueId, { league, matches });
          }
        }
      }

      return Array.from(leagueGroupsMap.values());
    }, cacheTime);
  }
};
